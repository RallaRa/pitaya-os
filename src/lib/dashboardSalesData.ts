import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { getDisplayNetSales, getDisplayTotalSale, type SalesDocData } from '@/lib/posDailySales';

export interface PeriodTotals {
  label: string;
  net: number;
  total: number;
  customers: number;
  start?: string;
  end?: string;
  source: 'daily_reports' | 'pos_daily_sales' | 'mixed';
}

export interface ItemAggregate {
  name: string;
  qty: number;
  amount: number;
  days: Set<string>;
}

/** daily_reports 기간 조회 (storeId equality → reportDate range) */
export async function fetchDailyReportsInRange(
  storeId: string,
  startYmd: string,
  endYmd: string,
) {
  try {
    return await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '>=', startYmd)
      .where('reportDate', '<=', endYmd)
      .limit(120)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] daily_reports range query failed:', err);
    return null;
  }
}

/** daily_reports 최근 N일 (storeId equality → reportDate >=) */
export async function fetchDailyReportsSince(storeId: string, sinceYmd: string) {
  try {
    return await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '>=', sinceYmd)
      .limit(200)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] daily_reports since query failed:', err);
    return null;
  }
}

/** pos_daily_sales 기간 조회 */
export async function fetchPosDailySalesInRange(
  storeId: string,
  startYmd: string,
  endYmd: string,
) {
  try {
    return await adminDb.collection('pos_daily_sales')
      .where('storeId', '==', storeId)
      .where('date', '>=', startYmd)
      .where('date', '<=', endYmd)
      .limit(120)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] pos_daily_sales range query failed:', err);
    return null;
  }
}

export function aggregateDailyReports(
  docs: Array<{ reportDate: string; storeId?: string; totalSales?: number; netSales?: number; netSale?: number; returnAmount?: number; discountAmount?: number; customerCount?: number }>,
  storeId: string,
  label: string,
  start?: string,
  end?: string,
): PeriodTotals {
  const byDate = pickBestReportByDate(docs, storeId);
  let net = 0;
  let total = 0;
  let customers = 0;

  for (const dr of byDate.values()) {
    const t = dr.totalSales ?? 0;
    net += dr.netSales ?? dr.netSale ?? (t - (dr.returnAmount ?? 0) - (dr.discountAmount ?? 0));
    total += t;
    customers += dr.customerCount ?? 0;
  }

  return { label, net, total, customers, start, end, source: 'daily_reports' };
}

export function aggregatePosDailySales(
  docs: QueryDocumentSnapshot[],
  label: string,
  start?: string,
  end?: string,
): PeriodTotals {
  let net = 0;
  let total = 0;
  let customers = 0;

  docs.forEach(d => {
    const data = d.data() as SalesDocData & { customerCount?: number; transCount?: number };
    total += getDisplayTotalSale(data);
    net += getDisplayNetSales(data);
    customers += data.customerCount ?? data.transCount ?? 0;
  });

  return { label, net, total, customers, start, end, source: 'pos_daily_sales' };
}

/** daily_reports → pos_daily_sales 순으로 기간 매출 집계 */
export async function fetchPeriodTotals(
  storeId: string,
  startYmd: string,
  endYmd: string,
  label: string,
): Promise<PeriodTotals> {
  const drSnap = await fetchDailyReportsInRange(storeId, startYmd, endYmd);
  if (drSnap && !drSnap.empty) {
    const agg = aggregateDailyReports(
      drSnap.docs.map(d => ({ ...d.data(), reportDate: d.data().reportDate as string, storeId: d.data().storeId as string })),
      storeId,
      label,
      startYmd,
      endYmd,
    );
    if (agg.net > 0 || agg.total > 0) return agg;
  }

  const posSnap = await fetchPosDailySalesInRange(storeId, startYmd, endYmd);
  if (posSnap && !posSnap.empty) {
    return aggregatePosDailySales(posSnap.docs, label, startYmd, endYmd);
  }

  return { label, net: 0, total: 0, customers: 0, start: startYmd, end: endYmd, source: 'daily_reports' };
}

/** 최근 7일 품목 집계 — daily_reports items → pos_sales_detail fallback */
export async function fetchWeeklyItemAggregates(
  storeId: string,
  sinceYmd: string,
  midYmd: string,
): Promise<{ itemMap: Record<string, ItemAggregate>; prevItemMap: Record<string, { qty: number }> }> {
  const itemMap: Record<string, ItemAggregate> = {};
  const prevItemMap: Record<string, { qty: number }> = {};

  const drSnap = await fetchDailyReportsSince(storeId, sinceYmd);
  if (drSnap && !drSnap.empty) {
    drSnap.docs.forEach(doc => {
      const d = doc.data();
      const date = (d.reportDate || '') as string;
      const isThisWeek = date >= midYmd;
      (d.items || []).forEach((item: { name?: string; barcode?: string; qty?: number; netSales?: number; amount?: number }) => {
        const name = item.name || item.barcode || '';
        if (!name || name.length > 50) return;
        if (isThisWeek) {
          if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0, days: new Set() };
          itemMap[name].qty += Number(item.qty || 0);
          itemMap[name].amount += Number(item.netSales || item.amount || 0);
          itemMap[name].days.add(date);
        } else {
          if (!prevItemMap[name]) prevItemMap[name] = { qty: 0 };
          prevItemMap[name].qty += Number(item.qty || 0);
        }
      });
    });
    if (Object.keys(itemMap).length > 0) return { itemMap, prevItemMap };
  }

  const sinceCompact = sinceYmd.replace(/-/g, '');
  try {
    const detailSnap = await adminDb.collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceCompact)
      .orderBy('date', 'desc')
      .limit(3000)
      .get();

    detailSnap.docs.forEach(doc => {
      const r = doc.data();
      const rawDate = String(r.date || '');
      const date = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate;
      const isThisWeek = date >= midYmd;
      const name = r.goodsName || '';
      if (!name) return;

      if (isThisWeek) {
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0, days: new Set() };
        itemMap[name].qty += Number(r.saleCount || 0);
        itemMap[name].amount += Number(r.totalPrice || 0);
        itemMap[name].days.add(date);
      } else {
        if (!prevItemMap[name]) prevItemMap[name] = { qty: 0 };
        prevItemMap[name].qty += Number(r.saleCount || 0);
      }
    });
  } catch (err) {
    console.warn('[dashboardSalesData] pos_sales_detail weekly query failed:', err);
  }

  return { itemMap, prevItemMap };
}

/** 매장에 POS/일마감 데이터 존재 여부 */
export async function storeHasSalesData(storeId: string): Promise<boolean> {
  if (!storeId) return false;

  const checks = await Promise.allSettled([
    adminDb.collection('pos_sales_detail').where('storeId', '==', storeId).limit(1).get(),
    adminDb.collection('pos_daily_sales').where('storeId', '==', storeId).limit(1).get(),
    adminDb.collection('daily_reports').where('storeId', '==', storeId).limit(1).get(),
  ]);

  return checks.some(c => c.status === 'fulfilled' && c.value.size > 0);
}
