import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchPeriodTotals, fetchTopSellingItems } from '@/lib/dashboardSalesData';
import { getDisplayNetSales } from '@/lib/posDailySales';
import { adminDb } from '@/lib/firebase/admin';
import { computeBreakEvenStatus } from '@/lib/breakEven.server';
import { buildPredictionAnalysisSnapshot } from '@/lib/predictionAnalysis';
import { getSidebarAnalysisDefaultYmd } from '@/lib/predictionDailyLock';
import { getCustomerVisitSummary } from '@/lib/customerVisitStats';
import {
  computeTargetProgress,
  createDefaultTargetsDoc,
  daysInMonthYm,
  getMonthTarget,
  prorateWeekTarget,
  resolveActivePeriod,
  type StoreSalesTargetsDoc,
} from '@/lib/salesTargets';
import type { PerformanceContext } from '@/lib/widgetPerformanceAnalysis';

async function loadTargets(storeId: string): Promise<StoreSalesTargetsDoc> {
  const snap = await adminDb.collection('store_sales_targets').doc(storeId).get();
  if (!snap.exists) return createDefaultTargetsDoc(storeId);
  const data = snap.data() as StoreSalesTargetsDoc;
  return {
    storeId,
    periods: data.periods?.length ? data.periods : createDefaultTargetsDoc(storeId).periods,
  };
}

async function fetchTodayYesterdayNet(storeId: string, todayStr: string) {
  const yesterdayStr = addDaysYMD(todayStr, -1);
  const [todaySnap, yesterdaySnap] = await Promise.all([
    adminDb.collection('pos_daily_sales').doc(`${storeId}_${todayStr}`).get(),
    adminDb.collection('pos_daily_sales').doc(`${storeId}_${yesterdayStr}`).get(),
  ]);
  const todayNet = todaySnap.exists ? getDisplayNetSales(todaySnap.data()) : 0;
  const yesterdayNet = yesterdaySnap.exists ? getDisplayNetSales(yesterdaySnap.data()) : 0;
  return { todayNet, yesterdayNet };
}

/** 경영성과 컨텍스트 — 매출·목표·예측·고객·BEP 집계 */
export async function buildPerformanceContext(storeId: string): Promise<PerformanceContext> {
  const todayStr = getKSTTodayYMD();
  const todayYm = todayStr.slice(0, 7);
  const dayOfWeek = new Date(`${todayStr}T12:00:00+09:00`).getDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = addDaysYMD(todayStr, -daysFromMon);
  const lastWeekEnd = addDaysYMD(thisWeekStart, -1);
  const lastWeekStart = addDaysYMD(lastWeekEnd, -6);
  const thisMonthStart = `${todayYm}-01`;
  const firstOfThisMonth = new Date(`${todayYm}-01T12:00:00+09:00`);
  const lastMonthEndDate = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthEnd = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEndDate.getDate()).padStart(2, '0')}`;
  const lastMonthStart = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-01`;

  const pct = (cur: number, prev: number) =>
    prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

  const [
    { todayNet, yesterdayNet },
    targetsDoc,
    thisWeek,
    lastWeek,
    thisMonth,
    lastMonth,
    bep,
    predSnap,
    weeklyTop,
    yesterdayTop,
    visitSummary,
    predictionDoc,
  ] = await Promise.all([
    fetchTodayYesterdayNet(storeId, todayStr),
    loadTargets(storeId),
    fetchPeriodTotals(storeId, thisWeekStart, todayStr, 'week'),
    fetchPeriodTotals(storeId, lastWeekStart, lastWeekEnd, 'lastWeek'),
    fetchPeriodTotals(storeId, thisMonthStart, todayStr, 'month'),
    fetchPeriodTotals(storeId, lastMonthStart, lastMonthEnd, 'lastMonth'),
    computeBreakEvenStatus(storeId).catch(() => null),
    buildPredictionAnalysisSnapshot(storeId, getSidebarAnalysisDefaultYmd()).catch(() => null),
    fetchTopSellingItems(storeId, 7, 1).catch(() => []),
    fetchTopSellingItems(storeId, 2, 1).catch(() => []),
    getCustomerVisitSummary(storeId).catch(() => null),
    adminDb.collection('predictions').doc(`${todayStr}_${storeId}`).get().catch(() => null),
  ]);

  const activePeriod = resolveActivePeriod(targetsDoc.periods, todayYm);
  const monthTarget = getMonthTarget(activePeriod, todayYm);
  const weekTarget = prorateWeekTarget(monthTarget, thisWeekStart, todayStr, todayStr);

  const monthProgress = computeTargetProgress({
    actualNet: thisMonth.net,
    actualCustomers: thisMonth.customers,
    startYmd: thisMonthStart,
    endYmd: todayStr,
    target: monthTarget,
    todayYmd: todayStr,
    periodDays: daysInMonthYm(todayYm),
  });

  const weekProgress = computeTargetProgress({
    actualNet: thisWeek.net,
    actualCustomers: thisWeek.customers,
    startYmd: thisWeekStart,
    endYmd: todayStr,
    target: weekTarget,
    todayYmd: todayStr,
    periodDays: 7,
  });

  let predictionTopItems: string[] = [];
  if (predictionDoc?.exists) {
    const p = predictionDoc.data();
    predictionTopItems = (p?.topItems as { item?: string }[] | undefined)?.map(t => t.item || '').filter(Boolean).slice(0, 5) ?? [];
  } else if (predSnap?.predicted?.topItems?.length) {
    predictionTopItems = predSnap.predicted.topItems.map(t => t.item).slice(0, 5);
  }

  let customerVisitorChangePct: number | null = null;
  if (visitSummary) {
    customerVisitorChangePct = visitSummary.visitorChangePct ?? null;
  }

  return {
    todayYmd: todayStr,
    todayNetSales: todayNet,
    yesterdayNetSales: yesterdayNet,
    salesChangePct: pct(todayNet, yesterdayNet),
    weekNetSales: thisWeek.net,
    weekSalesChangePct: pct(thisWeek.net, lastWeek.net),
    monthNetSales: thisMonth.net,
    monthSalesChangePct: pct(thisMonth.net, lastMonth.net),
    weekTargetPacePct: weekProgress.salesPacePct ?? null,
    monthTargetPacePct: monthProgress.salesPacePct ?? null,
    monthTargetSalesPct: monthProgress.salesPct ?? null,
    predictionAccuracyPct: predSnap?.accuracyScore ?? predSnap?.backtest?.avgAccuracy ?? null,
    predictionTopItems,
    predictionInsightSummary: predSnap?.insightSummary ?? null,
    weeklyTopItem: weeklyTop[0]?.name ?? null,
    yesterdayTopItem: yesterdayTop[0]?.name ?? null,
    customerVisitorChangePct,
    bepProgressPct: bep?.progressPct ?? null,
    bepAchieved: bep?.achieved ?? false,
    bepRemaining: bep?.remainingAmount ?? 0,
  };
}
