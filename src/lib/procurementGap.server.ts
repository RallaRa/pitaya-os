import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchStoreDailyItemStatsSince } from '@/lib/storeDailyItemStats';

export interface ProcurementGapRow {
  itemName: string;
  predictedRank: number | null;
  avgDailyQty: number;
  yesterdayQty: number;
  weatherExtraQty: number;
  recommendedQty: number;
  status: 'shortage_risk' | 'surplus_risk' | 'normal';
  note: string;
}

export interface ProcurementGapSummary {
  targetDate: string;
  predictionDate: string;
  gaps: ProcurementGapRow[];
  weatherCondition?: string;
  emptyReason?: string;
}

function normalizeName(name: string): string {
  return String(name || '').trim().replace(/\s+/g, ' ').slice(0, 50);
}

function fuzzyMatch(a: string, b: string): boolean {
  const x = a.toLowerCase();
  const y = b.toLowerCase();
  return x.includes(y) || y.includes(x);
}

export async function getProcurementGapSummary(storeId: string): Promise<ProcurementGapSummary> {
  const today = getKSTTodayYMD();
  const tomorrow = addDaysYMD(today, 1);
  const since7 = addDaysYMD(today, -6);
  const yesterday = addDaysYMD(today, -1);

  const [predTomorrow, predToday, statsDays, weatherDoc] = await Promise.all([
    adminDb.collection('predictions').doc(`${tomorrow}_${storeId}`).get(),
    adminDb.collection('predictions').doc(`${today}_${storeId}`).get(),
    fetchStoreDailyItemStatsSince(storeId, since7, today),
    adminDb.collection('pos_weather_order_suggestions').doc(`${storeId}_${tomorrow}`).get(),
  ]);

  const predData = predTomorrow.exists ? predTomorrow.data() : predToday.data();
  const predictionDate = predTomorrow.exists ? tomorrow : today;
  const topItems = ((predData?.topItems || []) as Array<{ item?: string; name?: string; rank?: number }>)
    .slice(0, 8)
    .map((it, i) => ({
      name: normalizeName(String(it.item || it.name || '')),
      rank: Number(it.rank || i + 1),
    }))
    .filter(it => it.name);

  const avgMap = new Map<string, { totalQty: number; days: Set<string> }>();
  const yesterdayMap = new Map<string, number>();

  for (const day of statsDays) {
    for (const row of Object.values(day.items || {})) {
      const name = normalizeName(row.name);
      if (!name) continue;
      if (!avgMap.has(name)) avgMap.set(name, { totalQty: 0, days: new Set() });
      const agg = avgMap.get(name)!;
      agg.totalQty += Number(row.qty || 0);
      agg.days.add(day.date);
      if (day.date === yesterday) {
        yesterdayMap.set(name, (yesterdayMap.get(name) || 0) + Number(row.qty || 0));
      }
    }
  }

  const weatherSuggestions = (weatherDoc.data()?.suggestions || []) as Array<{
    itemName?: string;
    suggestExtraQty?: number;
    upliftPct?: number;
  }>;
  const weatherCondition = String(weatherDoc.data()?.condition || predData?.weather?.condition || '');

  if (topItems.length === 0 && statsDays.length === 0) {
    return {
      targetDate: tomorrow,
      predictionDate,
      gaps: [],
      emptyReason: '예측·품목 통계 데이터가 아직 없습니다. POS 동기화 후 확인하세요.',
    };
  }

  const candidateNames = topItems.length > 0
    ? topItems.map(t => t.name)
    : [...avgMap.entries()]
      .sort((a, b) => (b[1].totalQty / Math.max(1, b[1].days.size)) - (a[1].totalQty / Math.max(1, a[1].days.size)))
      .slice(0, 6)
      .map(([name]) => name);

  const gaps: ProcurementGapRow[] = candidateNames.map((itemName, idx) => {
    const agg = avgMap.get(itemName);
    const avgDailyQty = agg ? Math.round((agg.totalQty / Math.max(1, agg.days.size)) * 10) / 10 : 0;
    const yesterdayQty = yesterdayMap.get(itemName) || 0;
    const predRank = topItems.find(t => t.name === itemName)?.rank ?? (topItems.length ? null : idx + 1);

    const weather = weatherSuggestions.find(w => fuzzyMatch(itemName, String(w.itemName || '')));
    const weatherExtraQty = Number(weather?.suggestExtraQty || 0);

    const baseNeed = Math.max(avgDailyQty, yesterdayQty * 0.9);
    const recommendedQty = Math.max(1, Math.ceil(baseNeed * 1.1 + weatherExtraQty));

    let status: ProcurementGapRow['status'] = 'normal';
    let note = '7일 평균·어제 실적 기준';
    if (yesterdayQty > avgDailyQty * 1.3 && avgDailyQty > 0) {
      status = 'shortage_risk';
      note = '어제 판매 급증 — 내일 재고 부족 위험';
    } else if (yesterdayQty < avgDailyQty * 0.5 && avgDailyQty >= 2) {
      status = 'surplus_risk';
      note = '최근 판매 부진 — 과발주 주의';
    }
    if (weatherExtraQty > 0) {
      note += ` · 날씨 +${weatherExtraQty}`;
    }

    return {
      itemName,
      predictedRank: predRank,
      avgDailyQty,
      yesterdayQty,
      weatherExtraQty,
      recommendedQty,
      status,
      note,
    };
  });

  return {
    targetDate: tomorrow,
    predictionDate,
    gaps: gaps.slice(0, 6),
    weatherCondition: weatherCondition || undefined,
  };
}
