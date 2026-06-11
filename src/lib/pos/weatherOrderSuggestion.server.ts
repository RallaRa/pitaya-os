import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchDailyReportsSince } from '@/lib/dashboardSalesData';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { ensureSalesAlertChannel, postMessengerCard } from '@/lib/messenger/channels.server';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';
import { fetchWeather, getStoreCoords } from '@/lib/weather';

export interface WeatherOrderSuggestion {
  itemName: string;
  upliftPct: number;
  suggestExtraQty: number;
  unit: string;
}

function isRainy(condition: string, rainMm = 0): boolean {
  return rainMm >= 1 || /비|소나기|눈|뇌우/.test(condition);
}

function isCold(tempMin: number): boolean {
  return tempMin <= 5;
}

function weatherBucket(condition: string, rainMm: number, tempMin: number): string {
  if (isRainy(condition, rainMm)) return 'rain';
  if (isCold(tempMin)) return 'cold';
  if (/맑/.test(condition)) return 'clear';
  return 'other';
}

function normalizeItemName(name: string): string {
  return String(name || '').trim().slice(0, 50);
}

export function computeWeatherItemUplifts(
  reports: Array<{
    date: string;
    condition: string;
    rainMm: number;
    tempMin: number;
    items: Record<string, number>;
  }>,
  targetBucket: string,
): WeatherOrderSuggestion[] {
  const allTotals = new Map<string, { sum: number; days: number }>();
  const matchTotals = new Map<string, { sum: number; days: number }>();

  for (const r of reports) {
    const bucket = weatherBucket(r.condition, r.rainMm, r.tempMin);
    for (const [name, qty] of Object.entries(r.items)) {
      const key = normalizeItemName(name);
      if (!key || qty <= 0) continue;
      if (!allTotals.has(key)) allTotals.set(key, { sum: 0, days: 0 });
      const all = allTotals.get(key)!;
      all.sum += qty;
      all.days += 1;
      if (bucket === targetBucket) {
        if (!matchTotals.has(key)) matchTotals.set(key, { sum: 0, days: 0 });
        const m = matchTotals.get(key)!;
        m.sum += qty;
        m.days += 1;
      }
    }
  }

  const suggestions: WeatherOrderSuggestion[] = [];
  for (const [name, all] of allTotals) {
    if (all.days < 5) continue;
    const baseline = all.sum / all.days;
    const match = matchTotals.get(name);
    if (!match || match.days < 3) continue;
    const matchAvg = match.sum / match.days;
    if (baseline <= 0) continue;
    const upliftPct = Math.round(((matchAvg - baseline) / baseline) * 100);
    if (upliftPct < 15) continue;
    const suggestExtraQty = Math.max(1, Math.round(matchAvg - baseline));
    suggestions.push({ itemName: name, upliftPct, suggestExtraQty, unit: 'kg' });
  }

  return suggestions.sort((a, b) => b.upliftPct - a.upliftPct).slice(0, 5);
}

export async function runWeatherOrderSuggestionForStore(storeId: string): Promise<{
  storeId: string;
  targetDate: string;
  notified: boolean;
  suggestions: WeatherOrderSuggestion[];
  skipped?: string;
}> {
  const settings = await getPosAlertSettings(storeId);
  const today = getKSTTodayYMD();
  const tomorrow = addDaysYMD(today, 1);

  if (!settings.weatherOrderEnabled) {
    return { storeId, targetDate: tomorrow, notified: false, suggestions: [], skipped: 'disabled' };
  }

  const dedupeRef = adminDb.collection('pos_weather_order_sent').doc(`${storeId}_${tomorrow}`);
  if ((await dedupeRef.get()).exists) {
    return { storeId, targetDate: tomorrow, notified: false, suggestions: [], skipped: 'already_sent' };
  }

  const storeDoc = await adminDb.collection('stores').doc(storeId).get();
  const coords = getStoreCoords(storeDoc.data()?.regionSido as string | undefined);
  const tomorrowWeather = await fetchWeather(tomorrow, coords);
  if (!tomorrowWeather) {
    return { storeId, targetDate: tomorrow, notified: false, suggestions: [], skipped: 'no_forecast' };
  }

  const since = addDaysYMD(today, -120);
  const snap = await fetchDailyReportsSince(storeId, since);
  const docs = snap.docs.map(d => d.data() as {
    reportDate: string;
    storeId?: string;
    source?: string;
    totalSales?: number;
    weather?: { condition?: string; rainMm?: number; tempMin?: number };
    items?: Array<{ name?: string; qty?: number }>;
  });
  const byDate = pickBestReportByDate(docs, storeId);
  const series: Array<{
    date: string;
    condition: string;
    rainMm: number;
    tempMin: number;
    items: Record<string, number>;
  }> = [];

  for (const [date, rep] of byDate) {
    if (date > today) continue;
    const w = rep.weather as { condition?: string; rainMm?: number; tempMin?: number } | undefined;
    const itemsMap: Record<string, number> = {};
    for (const it of (rep.items || []) as Array<{ name?: string; qty?: number }>) {
      const name = normalizeItemName(String(it.name || ''));
      if (!name) continue;
      itemsMap[name] = (itemsMap[name] || 0) + Number(it.qty || 0);
    }
    series.push({
      date,
      condition: String(w?.condition || ''),
      rainMm: Number(w?.rainMm || 0),
      tempMin: Number(w?.tempMin || 20),
      items: itemsMap,
    });
  }

  const targetBucket = weatherBucket(
    tomorrowWeather.condition,
    tomorrowWeather.rainMm || 0,
    tomorrowWeather.tempMin,
  );
  const suggestions = computeWeatherItemUplifts(series, targetBucket);
  if (!suggestions.length) {
    return { storeId, targetDate: tomorrow, notified: false, suggestions: [], skipped: 'no_uplift' };
  }

  const top = suggestions[0];
  const lines = suggestions.slice(0, 3).map(s =>
    `${s.itemName} +${s.upliftPct}% (추가 ${s.suggestExtraQty}${s.unit})`,
  ).join('\n');

  const message = [
    `${tomorrow} ${tomorrowWeather.condition} 예보`,
    `과거 ${targetBucket === 'rain' ? '비 오는 날' : targetBucket === 'cold' ? '한파' : '유사 날씨'} 대비:`,
    lines,
  ].join('\n');

  const roomId = await ensureSalesAlertChannel(storeId);
  await postMessengerCard({
    roomId,
    type: 'sales_report',
    text: message.replace(/\n/g, ' · '),
    cardData: {
      title: '🌧️ 날씨 연동 발주 제안',
      fields: [
        { label: '내일', value: `${tomorrowWeather.condition} (${tomorrow})` },
        { label: 'TOP', value: `${top.itemName} +${top.upliftPct}%` },
        { label: '추가 발주', value: `${top.suggestExtraQty}${top.unit} 권장` },
      ],
    },
    actions: [
      { id: 'order_now', label: '발주하기', style: 'primary' },
      { id: 'later', label: '나중에', style: 'ghost' },
    ],
  });

  await adminDb.collection('pos_weather_order_suggestions').doc(`${storeId}_${tomorrow}`).set({
    storeId,
    targetDate: tomorrow,
    weather: tomorrowWeather,
    targetBucket,
    suggestions,
    message,
    createdAt: FieldValue.serverTimestamp(),
  });

  await dedupeRef.set({ storeId, targetDate: tomorrow, sentAt: FieldValue.serverTimestamp() });

  return { storeId, targetDate: tomorrow, notified: true, suggestions };
}

export async function runWeatherOrderSuggestionAllStores() {
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
  const results = [];
  for (const doc of storesSnap.docs) {
    results.push(await runWeatherOrderSuggestionForStore(doc.id));
  }
  return results;
}
