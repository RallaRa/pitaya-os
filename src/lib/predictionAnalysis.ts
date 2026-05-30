import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import { fetchDailyReportsSince, fetchTopSellingItems } from '@/lib/dashboardSalesData';
import { getDisplayNetSales, posDailySalesDocId } from '@/lib/posDailySales';
import { dailyReportDocId } from '@/lib/reportCompare';

export interface ItemGrowthRow {
  name: string;
  recentQty: number;
  prevQty: number;
  growthPct: number | null;
  basis: string;
}

export interface ItemPredictionCompare {
  item: string;
  predictedRank: number | null;
  actualRank: number | null;
  predictedQty?: number;
  actualQty: number;
  match: boolean;
}

export interface PredictionAnalysisSnapshot {
  targetDate: string;
  predictionDate: string;
  noData: boolean;
  /** 전일 기준 품목 성장률 (최근7일 vs 이전7일) */
  itemGrowth: ItemGrowthRow[];
  /** 예측 당시 매출·품목 (predictions 컬렉션) */
  predicted: {
    date: string;
    supporterComment: string;
    topItems: Array<{ item: string; expectedSales?: number; changeVsLastWeek?: number; reasonDetail?: string }>;
    bottomItems: Array<{ item: string; expectedSales?: number; changeVsLastWeek?: number; reasonDetail?: string }>;
    keyFactors: string[];
  } | null;
  /** 실제 매출·품목 */
  actual: {
    date: string;
    netSales: number;
    totalSales: number;
    topItems: Array<{ name: string; qty: number; amount: number }>;
  } | null;
  /** 예측 vs 실제 품목 비교 */
  itemCompare: ItemPredictionCompare[];
  /** 매출 예측 오차 (있을 경우) */
  salesAccuracy: {
    predictedNet: number | null;
    actualNet: number;
    diffPct: number | null;
  };
  /** ai_partner_accuracy / predictions 기반 정합성 */
  accuracyScore: number | null;
  /** 대시보드 AI 프롬프트용 요약 */
  insightSummary: string;
}

function ymdCompact(ymd: string) {
  return ymd.replace(/-/g, '');
}

function eachDateYmd(startYmd: string, endYmd: string): string[] {
  const dates: string[] = [];
  let cur = startYmd;
  while (cur <= endYmd) {
    dates.push(cur);
    cur = addDaysYMD(cur, 1);
  }
  return dates;
}

function mergeItemsIntoMap(
  map: Record<string, { qty: number; amount: number }>,
  items: Array<{ name?: string; qty?: number; netSales?: number; amount?: number }>,
) {
  items.forEach(item => {
    const name = String(item.name || '').trim();
    if (!name) return;
    if (!map[name]) map[name] = { qty: 0, amount: 0 };
    map[name].qty += Number(item.qty || 0);
    map[name].amount += Number(item.netSales || item.amount || 0);
  });
}

async function fetchReportItemsForDate(storeId: string, dateYmd: string) {
  const byId = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, dateYmd))
    .get();
  if (byId.exists) return (byId.data()?.items || []) as Array<{ name?: string; qty?: number; netSales?: number; amount?: number }>;

  const q = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '==', dateYmd)
    .limit(3)
    .get();
  if (!q.empty) return (q.docs[0].data().items || []) as Array<{ name?: string; qty?: number; netSales?: number; amount?: number }>;
  return [];
}

async function aggregateItemsBetween(
  storeId: string,
  startYmd: string,
  endYmd: string,
): Promise<Record<string, { qty: number; amount: number }>> {
  const map: Record<string, { qty: number; amount: number }> = {};

  const drSnap = await fetchDailyReportsSince(storeId, startYmd);
  if (drSnap && !drSnap.empty) {
    drSnap.docs.forEach(doc => {
      const d = doc.data();
      const rd = String(d.reportDate || '');
      if (rd < startYmd || rd > endYmd) return;
      mergeItemsIntoMap(map, d.items || []);
    });
  }

  if (Object.keys(map).length === 0) {
    const dates = eachDateYmd(startYmd, endYmd);
    const batches = await Promise.all(dates.map(d => fetchReportItemsForDate(storeId, d)));
    batches.forEach(items => mergeItemsIntoMap(map, items));
  }

  if (Object.keys(map).length === 0) {
    try {
      const detailSnap = await adminDb.collection('pos_sales_detail')
        .where('storeId', '==', storeId)
        .where('date', '>=', ymdCompact(startYmd))
        .where('date', '<=', ymdCompact(endYmd))
        .limit(3000)
        .get();
      detailSnap.docs.forEach(doc => {
        const r = doc.data();
        const name = String(r.goodsName || '').trim();
        if (!name) return;
        if (!map[name]) map[name] = { qty: 0, amount: 0 };
        map[name].qty += Number(r.saleCount || 0);
        map[name].amount += Number(r.totalPrice || 0);
      });
    } catch { /* index 없으면 skip */ }
  }

  return map;
}

export async function computeItemGrowthRates(storeId: string): Promise<ItemGrowthRow[]> {
  const today = getKSTTodayYMD();
  const recentStart = addDaysYMD(today, -7);
  const prevStart = addDaysYMD(today, -14);
  const prevEnd = addDaysYMD(today, -8);

  const [recentMap, prevMap] = await Promise.all([
    aggregateItemsBetween(storeId, recentStart, today),
    aggregateItemsBetween(storeId, prevStart, prevEnd),
  ]);

  const names = new Set([...Object.keys(recentMap), ...Object.keys(prevMap)]);
  const rows: ItemGrowthRow[] = [];

  names.forEach(name => {
    const recentQty = recentMap[name]?.qty || 0;
    const prevQty = prevMap[name]?.qty || 0;
    if (recentQty === 0 && prevQty === 0) return;
    const growthPct = prevQty > 0
      ? Math.round(((recentQty - prevQty) / prevQty) * 100)
      : recentQty > 0 ? 100 : null;
    rows.push({
      name,
      recentQty,
      prevQty,
      growthPct,
      basis: `최근7일 ${recentQty}개 vs 이전7일 ${prevQty}개`,
    });
  });

  return rows.sort((a, b) => (b.growthPct ?? -999) - (a.growthPct ?? -999)).slice(0, 30);
}

async function loadActualForDate(storeId: string, dateYmd: string) {
  let netSales = 0;
  let totalSales = 0;

  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, dateYmd))
    .get();
  if (posSnap.exists) {
    const d = posSnap.data()!;
    netSales = getDisplayNetSales(d);
    totalSales = Number(d.totalSales || d.finish?.totalSale || netSales);
  } else {
    const drSnap = await adminDb.collection('daily_reports')
      .doc(dailyReportDocId(storeId, dateYmd))
      .get();
    if (drSnap.exists) {
      const d = drSnap.data()!;
      totalSales = Number(d.totalSales || 0);
      netSales = Number(d.netSales ?? d.netSale ?? totalSales);
    } else {
      const q = await adminDb.collection('daily_reports')
        .where('storeId', '==', storeId)
        .where('reportDate', '==', dateYmd)
        .limit(3)
        .get();
      if (!q.empty) {
        const d = q.docs[0].data();
        totalSales = Number(d.totalSales || 0);
        netSales = Number(d.netSales ?? d.netSale ?? totalSales);
      }
    }
  }

  const itemMap = await aggregateItemsBetween(storeId, dateYmd, dateYmd);
  const topItems = Object.entries(itemMap)
    .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  if (topItems.length === 0) {
    const fallback = await fetchTopSellingItems(storeId, 1, 10);
    fallback.forEach(i => topItems.push({ name: i.name, qty: i.qty, amount: 0 }));
  }

  return { date: dateYmd, netSales, totalSales, topItems };
}

async function loadPredictionDoc(storeId: string, predictionDate: string) {
  const docId = `${predictionDate}_${storeId || 'global'}`;
  const snap = await adminDb.collection('predictions').doc(docId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    date: predictionDate,
    supporterComment: String(d.supporterComment || ''),
    topItems: (d.topItems || []).slice(0, 10),
    bottomItems: (d.bottomItems || []).slice(0, 10),
    keyFactors: d.keyFactors || [],
  };
}

function compareItems(
  predictedTop: Array<{ item?: string; expectedSales?: number }>,
  actualTop: Array<{ name: string; qty: number }>,
): ItemPredictionCompare[] {
  const predNames = predictedTop.map(p => String(p.item || '').trim()).filter(Boolean);
  const actualNames = actualTop.map(a => a.name);
  const allNames = [...new Set([...predNames, ...actualNames])];

  return allNames.slice(0, 15).map(name => {
    const pIdx = predNames.indexOf(name);
    const aIdx = actualNames.indexOf(name);
    const pred = pIdx >= 0 ? predictedTop[pIdx] : null;
    const act = aIdx >= 0 ? actualTop[aIdx] : null;
    return {
      item: name,
      predictedRank: pIdx >= 0 ? pIdx + 1 : null,
      actualRank: aIdx >= 0 ? aIdx + 1 : null,
      predictedQty: pred?.expectedSales,
      actualQty: act?.qty || 0,
      match: pIdx >= 0 && aIdx >= 0 && Math.abs(pIdx - aIdx) <= 2,
    };
  });
}

function calcAccuracyScore(compares: ItemPredictionCompare[]): number | null {
  const predicted = compares.filter(c => c.predictedRank != null);
  if (predicted.length === 0) return null;
  const hits = compares.filter(c => c.predictedRank != null && c.actualRank != null && c.actualRank <= 5).length;
  return Math.round((hits / Math.min(predicted.length, 5)) * 100);
}

/** 전일 기준 예측 vs 실적 분석 (targetDate = 분석 대상일, 보통 어제) */
export async function buildPredictionAnalysisSnapshot(
  storeId: string,
  targetDate?: string,
): Promise<PredictionAnalysisSnapshot> {
  const target = targetDate || getKSTYesterdayYMD();
  const predictionMadeOn = addDaysYMD(target, -1);

  const [itemGrowth, predicted, actual, accuracySnap] = await Promise.all([
    computeItemGrowthRates(storeId),
    loadPredictionDoc(storeId, target),
    loadActualForDate(storeId, target),
    adminDb.collection('ai_partner_accuracy')
      .doc(`${storeId || 'global'}_${target}_today`)
      .get()
      .catch(() => null),
  ]);

  const predForTarget = predicted?.date === target
    ? predicted
    : await loadPredictionDoc(storeId, predictionMadeOn);

  const predictedTop = predForTarget?.topItems || [];
  const itemCompare = compareItems(predictedTop, actual.topItems);

  let accuracyScore = calcAccuracyScore(itemCompare);
  if (accuracySnap?.exists) {
    const s = accuracySnap.data()?.accuracyScore;
    if (typeof s === 'number') accuracyScore = s;
  }

  const topGrowth = itemGrowth.filter(r => (r.growthPct ?? 0) > 0).slice(0, 3);
  const insightParts: string[] = [];
  if (accuracyScore != null) {
    insightParts.push(`전일 예측 정합성 ${accuracyScore}%`);
  }
  if (topGrowth.length) {
    insightParts.push(
      `성장 품목: ${topGrowth.map(g => `${g.name}(${g.growthPct != null ? (g.growthPct >= 0 ? '+' : '') + g.growthPct + '%' : '-'})`).join(', ')}`,
    );
  }
  if (predForTarget?.keyFactors?.length) {
    insightParts.push(`예측 변수: ${predForTarget.keyFactors.slice(0, 3).join(', ')}`);
  }

  const noData = actual.topItems.length === 0 && actual.netSales === 0 && !predForTarget;

  return {
    targetDate: target,
    predictionDate: predForTarget?.date || predictionMadeOn,
    noData,
    itemGrowth,
    predicted: predForTarget,
    actual,
    itemCompare,
    salesAccuracy: {
      predictedNet: null,
      actualNet: actual.netSales,
      diffPct: null,
    },
    accuracyScore,
    insightSummary: insightParts.join(' · ') || '예측 분석 데이터 축적 중',
  };
}

/** sales-prediction 등 대시보드 AI에 넣을 짧은 컨텍스트 */
export async function getPredictionAnalysisInsights(storeId: string): Promise<string> {
  if (!storeId) return '';
  try {
    const snap = await buildPredictionAnalysisSnapshot(storeId);
    if (snap.noData) return '';
    const lines = [
      `[예측분석 ${snap.targetDate}] ${snap.insightSummary}`,
    ];
    if (snap.accuracyScore != null) {
      lines.push(`전일 TOP5 예측 적중률: ${snap.accuracyScore}%`);
    }
    const growthLine = snap.itemGrowth.slice(0, 5)
      .map(g => `${g.name}:${g.growthPct != null ? g.growthPct + '%' : '-'}(${g.basis})`)
      .join(', ');
    if (growthLine) lines.push(`품목 성장률(7일): ${growthLine}`);
    return lines.join('\n');
  } catch {
    return '';
  }
}
