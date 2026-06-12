import { adminDb } from '@/lib/firebase/admin';
import { loadCostRatioDetail } from '@/lib/costRatio';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { dailyReportDocId } from '@/lib/reportCompare';
import {
  computeBusinessDaysForCurrentMonth,
  currentMonthKey,
} from '@/lib/businessDays';
import {
  buildBreakEvenStatus,
  type BreakEvenStatus,
} from '@/lib/breakEvenCalc';
import {
  loadFixedCostsSettings,
  saveBreakEvenMeta,
  sumFixedCosts,
} from '@/lib/fixedCostsSettings';
import type { FixedCosts } from '@/lib/fixedCosts';
import {
  getDisplayNetSales,
  posDailySalesDocId,
  type SalesDocData,
} from '@/lib/posDailySales';

async function loadTodayNetSales(storeId: string, dateYmd: string): Promise<number> {
  const posSnap = await adminDb.collection('pos_daily_sales')
    .doc(posDailySalesDocId(storeId, dateYmd))
    .get();
  if (posSnap.exists) return getDisplayNetSales(posSnap.data() as SalesDocData);

  const reportSnap = await adminDb.collection('daily_reports')
    .doc(dailyReportDocId(storeId, dateYmd))
    .get();
  if (reportSnap.exists) return getDisplayNetSales(reportSnap.data() as SalesDocData);

  return 0;
}

async function resolveBusinessDays(storeId: string): Promise<number> {
  const settings = await loadFixedCostsSettings(storeId);
  const monthKey = currentMonthKey();
  if (settings.breakEvenMeta?.monthKey === monthKey && settings.breakEvenMeta.businessDays > 0) {
    return settings.breakEvenMeta.businessDays;
  }
  const computed = computeBusinessDaysForCurrentMonth(settings.closedDays);
  await saveBreakEvenMeta(storeId, {
    monthKey: computed.monthKey,
    businessDays: computed.businessDays,
    closedDays: settings.closedDays,
  });
  return computed.businessDays;
}

export async function computeBreakEvenStatus(
  storeId: string,
  dateYmd = getKSTTodayYMD(),
): Promise<BreakEvenStatus & { costs: FixedCosts }> {
  const [settings, costDetail, todayNetSales, businessDays] = await Promise.all([
    loadFixedCostsSettings(storeId),
    loadCostRatioDetail(storeId).catch(() => null),
    loadTodayNetSales(storeId, dateYmd),
    resolveBusinessDays(storeId),
  ]);

  const fixedCostsTotal = sumFixedCosts(settings.costs);
  const variableCostRatio = costDetail?.storeAvgRatio ?? 0.65;

  const status = buildBreakEvenStatus({
    date: dateYmd,
    fixedCostsTotal,
    variableCostRatio,
    businessDays,
    todayNetSales,
    monthKey: currentMonthKey(),
  });

  return { ...status, costs: settings.costs };
}

export async function refreshBreakEvenBusinessDays(storeId: string): Promise<{
  monthKey: string;
  businessDays: number;
}> {
  const settings = await loadFixedCostsSettings(storeId);
  const computed = computeBusinessDaysForCurrentMonth(settings.closedDays);
  await saveBreakEvenMeta(storeId, {
    monthKey: computed.monthKey,
    businessDays: computed.businessDays,
    closedDays: settings.closedDays,
  });
  return { monthKey: computed.monthKey, businessDays: computed.businessDays };
}

export async function refreshAllStoresBreakEvenBusinessDays(): Promise<Array<{
  storeId: string;
  monthKey: string;
  businessDays: number;
}>> {
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  const results = [];
  for (const doc of storesSnap.docs) {
    results.push({
      storeId: doc.id,
      ...(await refreshBreakEvenBusinessDays(doc.id)),
    });
  }
  return results;
}
