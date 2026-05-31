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

export interface BacktestDayRow {
  date: string;
  score: number;
  hits: number;
  predictedCount: number;
}

export interface PredictionCalibration {
  lookbackDays: number;
  avgAccuracy: number | null;
  recentScores: BacktestDayRow[];
  frequentlyMissed: string[];
  frequentlyOverpredicted: string[];
  reliableItems: string[];
  calibrationNotes: string[];
}

export interface AccuracyDetail {
  top5Hits: number;
  top5Total: number;
  rankBonus: number;
  score: number;
  method: string;
  matched: string[];
  missed: string[];
  surprises: string[];
}

export interface PredictionAnalysisSnapshot {
  targetDate: string;
  predictionDate: string;
  isPartialDay: boolean;
  noData: boolean;
  itemGrowth: ItemGrowthRow[];
  predicted: {
    date: string;
    supporterComment: string;
    topItems: Array<{ item: string; expectedSales?: number; changeVsLastWeek?: number; reasonDetail?: string }>;
    bottomItems: Array<{ item: string; expectedSales?: number; changeVsLastWeek?: number; reasonDetail?: string }>;
    keyFactors: string[];
  } | null;
  actual: {
    date: string;
    netSales: number;
    totalSales: number;
    topItems: Array<{ name: string; qty: number; amount: number }>;
  } | null;
  itemCompare: ItemPredictionCompare[];
  salesAccuracy: {
    predictedNet: number | null;
    actualNet: number;
    diffPct: number | null;
  };
  accuracyScore: number | null;
  accuracyDetail: AccuracyDetail | null;
  backtest: PredictionCalibration;
  insightSummary: string;
}

/* ── 품목명 정규화·유사 매칭 ── */
export function normalizeItemName(name: string): string {
  return String(name || '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '')
    .replace(/[^\w가-힣]/g, '');
}

export function itemNamesMatch(a: string, b: string): boolean {
  const na = normalizeItemName(a);
  const nb = normalizeItemName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  if (na.length >= 2 && nb.length >= 2 && (na.includes(nb) || nb.includes(na))) return true;
  const minLen = Math.min(na.length, nb.length);
  if (minLen >= 4 && na.slice(0, 4) === nb.slice(0, 4)) return true;
  return false;
}

function findMatchIndex(name: string, list: string[]): number {
  const idx = list.findIndex(n => itemNamesMatch(name, n));
  return idx;
}

function resolveName(name: string, list: string[]): string {
  const idx = findMatchIndex(name, list);
  return idx >= 0 ? list[idx] : name;
}

/* ── 예측 정확도 평가 (TOP-K 적중 + 순위 근접 보너스) ── */
export function evaluatePrediction(
  predictedNames: string[],
  actualNames: string[],
  k = 5,
): AccuracyDetail {
  const pred = predictedNames.slice(0, k).filter(Boolean);
  const actual = actualNames.filter(Boolean);
  const actualTop = actual.slice(0, k);

  const matched: string[] = [];
  const missed: string[] = [];
  let rankBonus = 0;

  pred.forEach((pName, pIdx) => {
    const aIdx = findMatchIndex(pName, actualTop);
    if (aIdx >= 0) {
      matched.push(pName);
      const rankDiff = Math.abs(pIdx - aIdx);
      rankBonus += rankDiff === 0 ? 20 : rankDiff === 1 ? 10 : rankDiff === 2 ? 5 : 0;
    } else {
      missed.push(pName);
    }
  });

  const surprises = actualTop.filter(aName =>
    findMatchIndex(aName, pred) < 0
  );

  const hits = matched.length;
  const hitScore = pred.length > 0 ? (hits / Math.min(pred.length, k)) * 70 : 0;
  const bonusCap = pred.length > 0 ? Math.min(30, rankBonus / pred.length) : 0;
  const score = Math.round(Math.min(100, hitScore + bonusCap));

  return {
    top5Hits: hits,
    top5Total: Math.min(pred.length, k),
    rankBonus: Math.round(bonusCap),
    score,
    method: 'TOP5적중(70%) + 순위근접(30%)',
    matched,
    missed,
    surprises,
  };
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

export async function computeItemGrowthRates(storeId: string, asOfDate?: string): Promise<ItemGrowthRow[]> {
  const today = asOfDate || getKSTTodayYMD();
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

async function loadPredictionFromPredictions(storeId: string, dateYmd: string) {
  const docId = `${dateYmd}_${storeId || 'global'}`;
  const snap = await adminDb.collection('predictions').doc(docId).get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  return {
    date: dateYmd,
    supporterComment: String(d.supporterComment || ''),
    topItems: (d.topItems || []).slice(0, 10),
    bottomItems: (d.bottomItems || []).slice(0, 10),
    keyFactors: d.keyFactors || [],
  };
}

async function loadPredictionFromAccuracy(storeId: string, dateYmd: string) {
  const snap = await adminDb.collection('ai_partner_accuracy')
    .doc(`${storeId || 'global'}_${dateYmd}_today`)
    .get();
  if (!snap.exists) return null;
  const d = snap.data()!;
  const topNames: string[] = d.predictedTopItems || [];
  if (topNames.length === 0) return null;
  return {
    date: dateYmd,
    supporterComment: String(d.predictedOpinion || ''),
    topItems: topNames.map((item: string, i: number) => ({ item, rank: i + 1 })),
    bottomItems: (d.predictedBottomItems || []).map((item: string, i: number) => ({ item, rank: i + 1 })),
    keyFactors: [] as string[],
  };
}

/** 대상일 예측 — predictions → ai_partner_accuracy → 전일 predictions 순 */
async function loadPredictionForTarget(storeId: string, targetDate: string) {
  const sources = [
    () => loadPredictionFromPredictions(storeId, targetDate),
    () => loadPredictionFromAccuracy(storeId, targetDate),
    () => loadPredictionFromPredictions(storeId, addDaysYMD(targetDate, -1)),
    () => loadPredictionFromAccuracy(storeId, addDaysYMD(targetDate, -1)),
  ];
  for (const load of sources) {
    const pred = await load();
    if (pred && pred.topItems.length > 0) return pred;
  }
  return null;
}

function compareItems(
  predictedTop: Array<{ item?: string; expectedSales?: number }>,
  actualTop: Array<{ name: string; qty: number }>,
): ItemPredictionCompare[] {
  const predNames = predictedTop.map(p => String(p.item || '').trim()).filter(Boolean);
  const actualNames = actualTop.map(a => a.name);
  const seen = new Set<string>();
  const allNames: string[] = [];

  [...predNames, ...actualNames].forEach(raw => {
    const canonical = resolveName(raw, actualNames.length ? actualNames : predNames);
    const key = normalizeItemName(canonical);
    if (!seen.has(key)) {
      seen.add(key);
      allNames.push(canonical);
    }
  });

  return allNames.slice(0, 15).map(name => {
    const pIdx = findMatchIndex(name, predNames);
    const aIdx = findMatchIndex(name, actualNames);
    const pred = pIdx >= 0 ? predictedTop[pIdx] : null;
    const act = aIdx >= 0 ? actualTop[aIdx] : null;
    const pRank = pIdx >= 0 ? pIdx + 1 : null;
    const aRank = aIdx >= 0 ? aIdx + 1 : null;
    return {
      item: act?.name || pred?.item || name,
      predictedRank: pRank,
      actualRank: aRank,
      predictedQty: pred?.expectedSales,
      actualQty: act?.qty || 0,
      match: pRank != null && aRank != null && Math.abs(pRank - aRank) <= 2,
    };
  });
}

/** 과거 N일 백테스트 — 예측 vs 실적 축적 */
export async function runBacktest(
  storeId: string,
  endDate: string,
  lookbackDays = 14,
): Promise<PredictionCalibration> {
  const today = getKSTTodayYMD();
  const end = endDate > today ? today : endDate;
  const start = addDaysYMD(end, -(lookbackDays - 1));

  const missedCount: Record<string, number> = {};
  const overCount: Record<string, number> = {};
  const hitCount: Record<string, number> = {};
  const recentScores: BacktestDayRow[] = [];

  const dates = eachDateYmd(start, end).filter(d => d < today || d === end);

  for (const dateYmd of dates) {
    const [pred, actual] = await Promise.all([
      loadPredictionForTarget(storeId, dateYmd),
      loadActualForDate(storeId, dateYmd),
    ]);
    if (!pred?.topItems?.length || actual.topItems.length === 0) continue;

    const predNames = pred.topItems.map(p => String(p.item || '')).filter(Boolean);
    const actualNames = actual.topItems.map(a => a.name);
    const evalResult = evaluatePrediction(predNames, actualNames);

    recentScores.push({
      date: dateYmd,
      score: evalResult.score,
      hits: evalResult.top5Hits,
      predictedCount: evalResult.top5Total,
    });

    evalResult.missed.forEach(n => { overCount[n] = (overCount[n] || 0) + 1; });
    evalResult.surprises.forEach(n => { missedCount[n] = (missedCount[n] || 0) + 1; });
    evalResult.matched.forEach(n => { hitCount[n] = (hitCount[n] || 0) + 1; });
  }

  const avgAccuracy = recentScores.length > 0
    ? Math.round(recentScores.reduce((s, r) => s + r.score, 0) / recentScores.length)
    : null;

  const minAppearances = Math.max(2, Math.floor(recentScores.length * 0.3));
  const frequentlyMissed = Object.entries(missedCount)
    .filter(([, c]) => c >= minAppearances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => n);

  const frequentlyOverpredicted = Object.entries(overCount)
    .filter(([, c]) => c >= minAppearances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => n);

  const reliableItems = Object.entries(hitCount)
    .filter(([, c]) => c >= minAppearances)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([n]) => n);

  const calibrationNotes: string[] = [];
  if (avgAccuracy != null) {
    calibrationNotes.push(`최근 ${recentScores.length}일 평균 TOP5 적중률 ${avgAccuracy}%`);
  }
  if (frequentlyMissed.length) {
    calibrationNotes.push(`과소예측(실적↑): ${frequentlyMissed.join(', ')}`);
  }
  if (frequentlyOverpredicted.length) {
    calibrationNotes.push(`과대예측(실적↓): ${frequentlyOverpredicted.join(', ')}`);
  }
  if (reliableItems.length) {
    calibrationNotes.push(`안정 적중 품목: ${reliableItems.join(', ')}`);
  }

  return {
    lookbackDays,
    avgAccuracy,
    recentScores: recentScores.sort((a, b) => b.date.localeCompare(a.date)),
    frequentlyMissed,
    frequentlyOverpredicted,
    reliableItems,
    calibrationNotes,
  };
}

/** 백테스트 기반 예측 보정 — AI 결과 후처리 */
export function applyCalibrationToPredictions<T extends { item: string; confidence?: number; rank?: number }>(
  topItems: T[],
  calibration: PredictionCalibration,
): T[] {
  if (!calibration.avgAccuracy && calibration.recentScores.length === 0) return topItems;

  const boosted = topItems.map(it => {
    let conf = Number(it.confidence ?? 70);
    if (calibration.reliableItems.some(r => itemNamesMatch(r, it.item))) conf += 8;
    if (calibration.frequentlyOverpredicted.some(r => itemNamesMatch(r, it.item))) conf -= 12;
    return { ...it, confidence: Math.min(98, Math.max(35, conf)) };
  });

  const existing = new Set(boosted.map(it => normalizeItemName(it.item)));
  const toAdd = calibration.frequentlyMissed
    .filter(name => !existing.has(normalizeItemName(name)))
    .slice(0, 2)
    .map((item, i) => ({
      item,
      rank: boosted.length + i + 1,
      confidence: 72,
      expectedSales: 0,
      changeVsLastWeek: 10,
      reasonDetail: `백테스트: 최근 ${calibration.lookbackDays}일간 실적 TOP 빈번, 예측 누락 보정`,
      badges: ['💡보정'],
      reasons: ['백테스트 과소예측 보정'],
    } as unknown as T));

  return [...boosted, ...toAdd].slice(0, 7);
}

export async function getPredictionCalibration(storeId: string): Promise<PredictionCalibration> {
  return runBacktest(storeId, getKSTYesterdayYMD(), 14);
}

export async function buildPredictionAnalysisSnapshot(
  storeId: string,
  targetDate?: string,
): Promise<PredictionAnalysisSnapshot> {
  const today = getKSTTodayYMD();
  const target = targetDate || getKSTYesterdayYMD();
  const isPartialDay = target === today;

  const [itemGrowth, predicted, actual, backtest] = await Promise.all([
    computeItemGrowthRates(storeId, target),
    loadPredictionForTarget(storeId, target),
    loadActualForDate(storeId, target),
    runBacktest(storeId, addDaysYMD(target, -1), 14),
  ]);

  const predNames = (predicted?.topItems || []).map(p => String(p.item || '')).filter(Boolean);
  const actualNames = actual.topItems.map(a => a.name);
  const itemCompare = compareItems(predicted?.topItems || [], actual.topItems);
  const accuracyDetail = predNames.length > 0 && actualNames.length > 0
    ? evaluatePrediction(predNames, actualNames)
    : null;

  let accuracyScore = accuracyDetail?.score ?? null;

  // 백테스트 평균과 당일 점수 가중 혼합 (당일 데이터 있을 때)
  if (accuracyScore != null && backtest.avgAccuracy != null) {
    accuracyScore = Math.round(accuracyScore * 0.6 + backtest.avgAccuracy * 0.4);
  } else if (accuracyScore == null && backtest.avgAccuracy != null) {
    accuracyScore = backtest.avgAccuracy;
  }

  const topGrowth = itemGrowth.filter(r => (r.growthPct ?? 0) > 0).slice(0, 3);
  const insightParts: string[] = [];

  if (isPartialDay) insightParts.push('당일 실적 누적 중');
  if (accuracyDetail) {
    insightParts.push(`${target} 예측 ${accuracyDetail.top5Hits}/${accuracyDetail.top5Total} 적중 (${accuracyDetail.score}%)`);
  }
  if (backtest.avgAccuracy != null) {
    insightParts.push(`백테스트 ${backtest.recentScores.length}일 평균 ${backtest.avgAccuracy}%`);
  }
  if (topGrowth.length) {
    insightParts.push(
      `성장: ${topGrowth.map(g => `${g.name}(${g.growthPct != null ? (g.growthPct >= 0 ? '+' : '') + g.growthPct + '%' : '-'})`).join(', ')}`,
    );
  }
  if (backtest.calibrationNotes.length) {
    insightParts.push(backtest.calibrationNotes[0]);
  }

  const noData = actual.topItems.length === 0 && actual.netSales === 0 && !predicted;

  return {
    targetDate: target,
    predictionDate: predicted?.date || addDaysYMD(target, -1),
    isPartialDay,
    noData,
    itemGrowth,
    predicted,
    actual,
    itemCompare,
    salesAccuracy: {
      predictedNet: null,
      actualNet: actual.netSales,
      diffPct: null,
    },
    accuracyScore,
    accuracyDetail,
    backtest,
    insightSummary: insightParts.join(' · ') || '예측 분석 데이터 축적 중',
  };
}

export async function getPredictionAnalysisInsights(storeId: string): Promise<string> {
  if (!storeId) return '';
  try {
    const snap = await buildPredictionAnalysisSnapshot(storeId);
    if (snap.noData && snap.backtest.recentScores.length === 0) return '';

    const lines: string[] = [
      `[예측분석 ${snap.targetDate}] ${snap.insightSummary}`,
    ];

    if (snap.accuracyDetail) {
      lines.push(
        `당일 TOP5: 적중 ${snap.accuracyDetail.top5Hits}/${snap.accuracyDetail.top5Total}, ` +
        `과대예측 ${snap.accuracyDetail.missed.join('/') || '없음'}, ` +
        `누락 ${snap.accuracyDetail.surprises.join('/') || '없음'}`,
      );
    }

    const bt = snap.backtest;
    if (bt.avgAccuracy != null) {
      lines.push(`백테스트 ${bt.recentScores.length}일 평균 적중률 ${bt.avgAccuracy}% — 다음 예측 시 반영:`);
    }
    bt.calibrationNotes.forEach(note => lines.push(`· ${note}`));

    if (bt.frequentlyMissed.length) {
      lines.push(`→ 과소예측 보정: ${bt.frequentlyMissed.join(', ')} 는 실적 TOP에 자주 등장. TOP5에 포함 검토`);
    }
    if (bt.frequentlyOverpredicted.length) {
      lines.push(`→ 과대예측 주의: ${bt.frequentlyOverpredicted.join(', ')} 는 예측 대비 실적 약함`);
    }
    if (bt.reliableItems.length) {
      lines.push(`→ 안정 품목: ${bt.reliableItems.join(', ')}`);
    }

    const growthLine = snap.itemGrowth.slice(0, 5)
      .map(g => `${g.name}:${g.growthPct != null ? g.growthPct + '%' : '-'}`)
      .join(', ');
    if (growthLine) lines.push(`품목 성장률(7일): ${growthLine}`);

    return lines.join('\n');
  } catch {
    return '';
  }
}
