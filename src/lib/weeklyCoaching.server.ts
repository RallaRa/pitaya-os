import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { HOLIDAYS } from '@/components/calendar/CalendarTypes';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';
import { generateTextWithFallback, hasAnyAiProvider } from '@/lib/aiProviderFallback';
import { ensureSalesAlertChannel, postMessengerText } from '@/lib/messenger/channels.server';
import { getStockThresholds } from '@/lib/pos/stockWarning.server';
import { fetchWeather, getStoreCoords } from '@/lib/weather';
import {
  buildWeekId,
  formatWeeklyCoachingMessenger,
  type WeeklyCoachingBriefing,
} from '@/lib/weeklyCoaching';

function lastCompletedWeek(today = getKSTTodayYMD()): { start: string; end: string; weekId: string } {
  const d = new Date(`${today}T12:00:00+09:00`);
  const dow = d.getDay();
  const daysFromMonday = dow === 0 ? 6 : dow - 1;
  const thisMonday = addDaysYMD(today, -daysFromMonday);
  const lastMonday = addDaysYMD(thisMonday, -7);
  const lastSunday = addDaysYMD(thisMonday, -1);
  return { start: lastMonday, end: lastSunday, weekId: buildWeekId(lastMonday) };
}

function priorWeekRange(lastStart: string): { start: string; end: string } {
  return { start: addDaysYMD(lastStart, -7), end: addDaysYMD(lastStart, -1) };
}

function thisWeekHolidays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) {
    if (HOLIDAYS[cur]) out.push(`${cur} ${HOLIDAYS[cur]}`);
    cur = addDaysYMD(cur, 1);
  }
  return out;
}

async function loadTopItems(storeId: string, start: string, end: string) {
  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '>=', start)
    .where('reportDate', '<=', end)
    .limit(31)
    .get();

  const itemMap = new Map<string, number>();
  for (const doc of snap.docs) {
    const items = doc.data().items;
    if (!Array.isArray(items)) continue;
    for (const it of items) {
      const name = String(it.name || it.itemName || '품목');
      const amt = Number(it.netSales ?? it.amount ?? 0);
      itemMap.set(name, (itemMap.get(name) || 0) + amt);
    }
  }
  const sorted = [...itemMap.entries()].sort((a, b) => b[1] - a[1]);
  return {
    best: sorted.slice(0, 5).map(([name, amount]) => ({ name, amount })),
    worst: sorted.slice(-5).reverse().map(([name, amount]) => ({ name, amount })),
  };
}

async function loadMarketPriceSample(): Promise<string[]> {
  const snap = await adminDb.collection('market_prices')
    .orderBy('scrapedAt', 'desc')
    .limit(8)
    .get();
  return snap.docs.map(d => {
    const x = d.data();
    const name = String(x.standardName || x.name || x.groupKey || '품목');
    const price = Number(x.price ?? x.avgPrice ?? 0);
    return price > 0 ? `${name} ${price.toLocaleString()}원/kg` : name;
  });
}

async function loadStoreRegion(storeId: string): Promise<string> {
  const doc = await adminDb.collection('stores').doc(storeId).get();
  return String(doc.data()?.address?.sido || doc.data()?.region || '서울');
}

export async function generateWeeklyCoaching(
  storeId: string,
  options?: { skipMessenger?: boolean; forceWeek?: { start: string; end: string } },
): Promise<WeeklyCoachingBriefing> {
  const week: { start: string; end: string; weekId: string } = options?.forceWeek
    ? { ...options.forceWeek, weekId: buildWeekId(options.forceWeek.start) }
    : lastCompletedWeek();
  const prior = priorWeekRange(week.start);
  const thisWeekStart = addDaysYMD(week.end, 1);
  const thisWeekEnd = addDaysYMD(thisWeekStart, 6);

  const [
    lastTotals,
    priorTotals,
    topItems,
    stockRows,
    marketLines,
    region,
  ] = await Promise.all([
    fetchPeriodTotals(storeId, week.start, week.end, 'lastWeek'),
    fetchPeriodTotals(storeId, prior.start, prior.end, 'priorWeek'),
    loadTopItems(storeId, week.start, week.end),
    getStockThresholds(storeId),
    loadMarketPriceSample(),
    loadStoreRegion(storeId),
  ]);

  let weatherLine = '날씨 정보 없음';
  try {
    const coords = getStoreCoords(region);
    const today = getKSTTodayYMD();
    const w = await fetchWeather(today, coords);
    if (w) {
      weatherLine = `현재 ${w.condition}, ${w.tempMin}~${w.tempMax}°C, 강수 ${w.rainMm ?? 0}mm`;
    }
  } catch { /* ignore */ }

  const salesChange = priorTotals.net > 0
    ? ((lastTotals.net - priorTotals.net) / priorTotals.net) * 100
    : 0;
  const custChange = priorTotals.customers > 0
    ? ((lastTotals.customers - priorTotals.customers) / priorTotals.customers) * 100
    : 0;

  const holidays = thisWeekHolidays(thisWeekStart, thisWeekEnd);
  const lowStock = stockRows.slice(0, 5).map(r =>
    `${r.itemName} (시작 ${r.openingQty}${r.unit}, 경고 ${r.alertBelowQty}${r.unit})`,
  );

  const rawMetrics = {
    lastWeekNet: lastTotals.net,
    priorWeekNet: priorTotals.net,
    salesChangePct: salesChange,
    lastWeekCustomers: lastTotals.customers,
    custChangePct: custChange,
    aov: lastTotals.customers > 0 ? Math.round(lastTotals.net / lastTotals.customers) : 0,
    bestItems: topItems.best,
    worstItems: topItems.worst,
    holidays,
    weatherLine,
    marketLines,
    stockRows: lowStock,
  };

  const fallback: WeeklyCoachingBriefing = {
    weekId: week.weekId,
    storeId,
    periodStart: week.start,
    periodEnd: week.end,
    summary: `지난 주 매출 ${lastTotals.net.toLocaleString()}원 (전주 대비 ${salesChange >= 0 ? '+' : ''}${salesChange.toFixed(1)}%).`,
    focusTasks: [
      '저마진·저매출 품목 진열·가격 점검',
      '재고 임계 품목 발주 확인',
      '단골·이탈위험 고객 케어',
    ],
    inventoryAdvice: lowStock.length ? lowStock.map(s => `${s} — 발주 검토`) : ['재고 임계값 미설정 — POS 재고 설정 권장'],
    marketingSuggestion: holidays.length
      ? `이번 주 공휴일(${holidays.join(', ')}) 연계 프로모션 검토`
      : '베스트 품목 중심 SNS·단골 알림톡 제안',
    rawMetrics,
    messengerText: '',
    generatedAt: new Date().toISOString(),
  };
  fallback.messengerText = formatWeeklyCoachingMessenger(fallback);

  if (!hasAnyAiProvider()) {
    await saveWeeklyCoaching(fallback);
    if (!options?.skipMessenger) await postWeeklyCoachingMessenger(storeId, fallback);
    return fallback;
  }

  const prompt = [
    '정육점 주간 경영 브리핑을 한국어 JSON으로 작성하세요.',
    `지난 주(${week.start}~${week.end}): 매출 ${lastTotals.net.toLocaleString()}원, 객수 ${lastTotals.customers}, 객단가 ${rawMetrics.aov}`,
    `전주 대비: 매출 ${salesChange.toFixed(1)}%, 객수 ${custChange.toFixed(1)}%`,
    `베스트: ${topItems.best.map(i => `${i.name} ${i.amount.toLocaleString()}`).join(', ') || '없음'}`,
    `저조: ${topItems.worst.map(i => `${i.name} ${i.amount.toLocaleString()}`).join(', ') || '없음'}`,
    `재고: ${lowStock.join('; ') || '미설정'}`,
    `이번 주 날씨: ${weatherLine}`,
    `공휴일: ${holidays.join(', ') || '없음'}`,
    `축산 시세(스크래퍼): ${marketLines.join(', ') || '없음'}`,
    '',
    '{"summary":"2문장 총평","focusTasks":["과제1","과제2","과제3"],"inventoryAdvice":["발주1"],"marketingSuggestion":"1문장"}',
  ].join('\n');

  try {
    const ai = await generateTextWithFallback({
      prompt,
      json: true,
      useCase: 'insight',
      temperature: 0.5,
    });
    let parsed: {
      summary?: string;
      focusTasks?: string[];
      inventoryAdvice?: string[];
      marketingSuggestion?: string;
    } = {};
    try {
      parsed = JSON.parse(ai.text.replace(/```json\s*|```/g, '').trim());
    } catch {
      parsed = { summary: ai.text.slice(0, 200) };
    }

    const briefing: WeeklyCoachingBriefing = {
      ...fallback,
      summary: String(parsed.summary || fallback.summary),
      focusTasks: Array.isArray(parsed.focusTasks) ? parsed.focusTasks.map(String).slice(0, 3) : fallback.focusTasks,
      inventoryAdvice: Array.isArray(parsed.inventoryAdvice) ? parsed.inventoryAdvice.map(String).slice(0, 3) : fallback.inventoryAdvice,
      marketingSuggestion: String(parsed.marketingSuggestion || fallback.marketingSuggestion),
      provider: ai.provider,
    };
    briefing.messengerText = formatWeeklyCoachingMessenger(briefing);

    await saveWeeklyCoaching(briefing);
    if (!options?.skipMessenger) await postWeeklyCoachingMessenger(storeId, briefing);
    return briefing;
  } catch {
    await saveWeeklyCoaching(fallback);
    if (!options?.skipMessenger) await postWeeklyCoachingMessenger(storeId, fallback);
    return fallback;
  }
}

async function saveWeeklyCoaching(b: WeeklyCoachingBriefing) {
  const docId = `${b.storeId}_${b.weekId}`;
  await adminDb.collection('weekly_coaching').doc(docId).set({
    ...b,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

async function postWeeklyCoachingMessenger(storeId: string, b: WeeklyCoachingBriefing) {
  try {
    const roomId = await ensureSalesAlertChannel(storeId);
    await postMessengerText({ roomId, text: b.messengerText });
  } catch { /* ignore */ }
}

export async function getLatestWeeklyCoaching(storeId: string): Promise<WeeklyCoachingBriefing | null> {
  const snap = await adminDb.collection('weekly_coaching')
    .where('storeId', '==', storeId)
    .limit(20)
    .get();
  if (snap.empty) return null;
  const sorted = snap.docs
    .map(d => d.data() as WeeklyCoachingBriefing)
    .sort((a, b) => (b.periodEnd || '').localeCompare(a.periodEnd || ''));
  return sorted[0] || null;
}

export async function runWeeklyCoachingAllStores(): Promise<Array<{ storeId: string; ok: boolean; error?: string }>> {
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(30).get();
  const results = [];
  for (const doc of storesSnap.docs) {
    try {
      await generateWeeklyCoaching(doc.id, {});
      results.push({ storeId: doc.id, ok: true });
    } catch (e: unknown) {
      results.push({ storeId: doc.id, ok: false, error: e instanceof Error ? e.message : String(e) });
    }
  }
  return results;
}
