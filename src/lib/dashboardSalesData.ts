import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot, QuerySnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { getDisplayNetSales, getDisplayTotalSale, type SalesDocData } from '@/lib/posDailySales';
import {
  fetchStoreDailyItemStatsSince,
  rollupPredictionItemStatsFromDays,
  rollupWeeklyItemAggregatesFromDays,
} from '@/lib/storeDailyItemStats';

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

/** AI 예측용 품목 통계 — dailyAvgSales = 일평균매출(누적매출÷판매발생일수). 객단가·건당과 분리 */
export interface PredictionItemStat {
  name: string;
  qty: number;
  amount: number;
  salesDays: number;
  dailyAvgSales: number;
  changeVsLastWeek: number;
}

function addItemDay(
  map: Record<string, { qty: number; amount: number; days: Set<string>; w7: number; d7: Set<string>; wPrev7: number; dPrev7: Set<string> }>,
  name: string,
  date: string,
  qty: number,
  amount: number,
  window: 'all' | 'last7' | 'prev7',
) {
  const n = name.trim();
  if (!n || n.length > 50) return;
  if (!map[n]) {
    map[n] = { qty: 0, amount: 0, days: new Set(), w7: 0, d7: new Set(), wPrev7: 0, dPrev7: new Set() };
  }
  const row = map[n];
  row.qty += qty;
  row.amount += amount;
  row.days.add(date);
  if (window === 'last7') {
    row.w7 += amount;
    row.d7.add(date);
  } else if (window === 'prev7') {
    row.wPrev7 += amount;
    row.dPrev7.add(date);
  }
}

/** 90일 품목별 매출 — 날짜 중복 제거 후 일평균매출·전주 대비 */
export async function fetchPredictionItemStats(
  storeId: string,
  sinceYmd: string,
  todayYmd: string,
  limit = 20,
): Promise<PredictionItemStat[]> {
  const aggDays = await fetchStoreDailyItemStatsSince(storeId, sinceYmd, todayYmd);
  if (aggDays.length > 0) {
    const fromAgg = rollupPredictionItemStatsFromDays(aggDays, sinceYmd, todayYmd, limit);
    if (fromAgg.length > 0) return fromAgg;
  }

  const last7Start = addDaysYMD(todayYmd, -6);
  const prev7Start = addDaysYMD(todayYmd, -13);
  const prev7End = addDaysYMD(todayYmd, -7);

  const map: Record<string, {
    qty: number;
    amount: number;
    days: Set<string>;
    w7: number;
    d7: Set<string>;
    wPrev7: number;
    dPrev7: Set<string>;
  }> = {};

  const drSnap = await fetchDailyReportsSince(storeId, sinceYmd);
  if (drSnap && !drSnap.empty) {
    const reports = drSnap.docs.map(d => ({
      ...d.data(),
      reportDate: d.data().reportDate as string,
      storeId: d.data().storeId as string,
      items: d.data().items as Array<{ name?: string; barcode?: string; qty?: number; netSales?: number; amount?: number }> | undefined,
    }));
    for (const d of pickBestReportByDate(reports, storeId).values()) {
      const date = d.reportDate || '';
      if (!date || date > todayYmd) continue;
      let win: 'all' | 'last7' | 'prev7' = 'all';
      if (date >= last7Start) win = 'last7';
      else if (date >= prev7Start && date <= prev7End) win = 'prev7';
      (d.items || []).forEach(item => {
        const name = item.name || item.barcode || '';
        const qty = Number(item.qty || 0);
        const amt = Number(item.netSales || item.amount || 0);
        addItemDay(map, name, date, qty, amt, 'all');
        if (win === 'last7') addItemDay(map, name, date, qty, amt, 'last7');
        if (win === 'prev7') addItemDay(map, name, date, qty, amt, 'prev7');
      });
    }
  }

  if (Object.keys(map).length === 0) {
    const sinceCompact = sinceYmd.replace(/-/g, '');
    const detailSnap = await fetchPosSalesDetailSince(storeId, sinceCompact, 8000);
    detailSnap?.docs.forEach(doc => {
      const r = doc.data();
      const date = posDetailDateYmd(String(r.date || ''));
      if (!date || date < sinceYmd || date > todayYmd) return;
      let win: 'all' | 'last7' | 'prev7' = 'all';
      if (date >= last7Start) win = 'last7';
      else if (date >= prev7Start && date <= prev7End) win = 'prev7';
      const name = String(r.goodsName || '');
      const qty = Number(r.saleCount || 0);
      const amt = Number(r.totalPrice || 0);
      addItemDay(map, name, date, qty, amt, 'all');
      if (win === 'last7') addItemDay(map, name, date, qty, amt, 'last7');
      if (win === 'prev7') addItemDay(map, name, date, qty, amt, 'prev7');
    });
  }

  return Object.entries(map)
    .map(([name, row]) => {
      const salesDays = row.days.size || 1;
      const dailyAvgSales = Math.round(row.amount / salesDays);
      const avg7 = row.d7.size > 0 ? Math.round(row.w7 / row.d7.size) : 0;
      const avgPrev7 = row.dPrev7.size > 0 ? Math.round(row.wPrev7 / row.dPrev7.size) : 0;
      const changeVsLastWeek =
        avgPrev7 > 0 ? Math.round(((avg7 - avgPrev7) / avgPrev7) * 100) : avg7 > 0 ? 100 : 0;
      return {
        name,
        qty: row.qty,
        amount: row.amount,
        salesDays,
        dailyAvgSales,
        changeVsLastWeek,
      };
    })
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

function asQuerySnapshot(docs: QueryDocumentSnapshot[]): QuerySnapshot {
  return { empty: docs.length === 0, size: docs.length, docs } as QuerySnapshot;
}

/** Firestore 복합 인덱스 미배포 시 storeId 단일 조건 + 메모리 필터 */
async function fetchDailyReportsByStoreFallback(
  storeId: string,
  filter: (reportDate: string) => boolean,
  limit = 400,
): Promise<QuerySnapshot | null> {
  try {
    const snap = await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .limit(limit)
      .get();
    const docs = snap.docs.filter(d => filter((d.data().reportDate as string) || ''));
    return asQuerySnapshot(docs);
  } catch (err) {
    console.warn('[dashboardSalesData] daily_reports storeId-only fallback failed:', err);
    return null;
  }
}

export async function fetchPosSalesDetailSince(
  storeId: string,
  sinceCompact: string,
  limit = 10000,
): Promise<QuerySnapshot | null> {
  try {
    return await adminDb.collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceCompact)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] pos_sales_detail range query failed, using storeId-only fallback:', err);
    return fetchPosCollectionByStoreFallback('pos_sales_detail', storeId, sinceCompact, limit);
  }
}

async function fetchPosCollectionByStoreFallback(
  collection: string,
  storeId: string,
  sinceCompact: string,
  limit: number,
): Promise<QuerySnapshot | null> {
  try {
    const snap = await adminDb.collection(collection)
      .where('storeId', '==', storeId)
      .limit(Math.max(limit, 500))
      .get();
    const docs = snap.docs
      .filter(d => String(d.data().date || '') >= sinceCompact)
      .sort((a, b) => String(b.data().date || '').localeCompare(String(a.data().date || '')))
      .slice(0, limit);
    return asQuerySnapshot(docs);
  } catch (fallbackErr) {
    console.warn(`[dashboardSalesData] ${collection} storeId-only fallback failed:`, fallbackErr);
    return null;
  }
}

/** pos_sales_detail 최근 N건 — orderBy 실패 시 메모리 정렬 */
export async function fetchPosSalesDetailRecent(
  storeId: string,
  limit = 500,
): Promise<QuerySnapshot | null> {
  try {
    return await adminDb.collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] pos_sales_detail recent query failed, using fallback:', err);
    try {
      const snap = await adminDb.collection('pos_sales_detail')
        .where('storeId', '==', storeId)
        .limit(limit * 3)
        .get();
      const docs = [...snap.docs]
        .sort((a, b) => String(b.data().date || '').localeCompare(String(a.data().date || '')))
        .slice(0, limit);
      return asQuerySnapshot(docs);
    } catch (fallbackErr) {
      console.warn('[dashboardSalesData] pos_sales_detail recent fallback failed:', fallbackErr);
      return null;
    }
  }
}

export async function fetchPosSalesHeaderSince(
  storeId: string,
  sinceCompact: string,
  limit = 365,
): Promise<QuerySnapshot | null> {
  try {
    return await adminDb.collection('pos_sales_header')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceCompact)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] pos_sales_header range query failed, using fallback:', err);
    return fetchPosCollectionByStoreFallback('pos_sales_header', storeId, sinceCompact, limit);
  }
}

export async function fetchPosFinishTotalSince(
  storeId: string,
  sinceCompact: string,
  limit = 90,
): Promise<QuerySnapshot | null> {
  try {
    return await adminDb.collection('pos_finish_total')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceCompact)
      .orderBy('date', 'desc')
      .limit(limit)
      .get();
  } catch (err) {
    console.warn('[dashboardSalesData] pos_finish_total range query failed, using fallback:', err);
    return fetchPosCollectionByStoreFallback('pos_finish_total', storeId, sinceCompact, limit);
  }
}

async function fetchPosDailySalesByStoreFallback(
  storeId: string,
  startYmd: string,
  endYmd: string,
  limit = 400,
): Promise<QuerySnapshot | null> {
  try {
    const snap = await adminDb.collection('pos_daily_sales')
      .where('storeId', '==', storeId)
      .limit(limit)
      .get();
    const docs = snap.docs.filter(d => {
      const date = String(d.data().date || '');
      return date >= startYmd && date <= endYmd;
    });
    return asQuerySnapshot(docs);
  } catch (err) {
    console.warn('[dashboardSalesData] pos_daily_sales storeId-only fallback failed:', err);
    return null;
  }
}

function posDetailDateYmd(rawDate: string): string {
  return rawDate.length === 8
    ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
    : rawDate;
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
    console.warn('[dashboardSalesData] daily_reports range query failed, using fallback:', err);
    return fetchDailyReportsByStoreFallback(
      storeId,
      date => date >= startYmd && date <= endYmd,
    );
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
    console.warn('[dashboardSalesData] daily_reports since query failed, using fallback:', err);
    return fetchDailyReportsByStoreFallback(storeId, date => date >= sinceYmd);
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
    console.warn('[dashboardSalesData] pos_daily_sales range query failed, using fallback:', err);
    return fetchPosDailySalesByStoreFallback(storeId, startYmd, endYmd);
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
  const endYmd = getKSTTodayYMD();
  const aggDays = await fetchStoreDailyItemStatsSince(storeId, sinceYmd, endYmd);
  if (aggDays.length > 0) {
    const rolled = rollupWeeklyItemAggregatesFromDays(aggDays, midYmd);
    if (Object.keys(rolled.itemMap).length > 0) return rolled;
  }

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
  const detailSnap = await fetchPosSalesDetailSince(storeId, sinceCompact, 3000);
  if (detailSnap && !detailSnap.empty) {
    detailSnap.docs.forEach(doc => {
      const r = doc.data();
      const date = posDetailDateYmd(String(r.date || ''));
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
  }

  return { itemMap, prevItemMap };
}

/** 최근 N일 판매 상위 품목 — daily_reports → pos_sales_detail fallback */
export async function fetchTopSellingItems(
  storeId: string,
  days = 30,
  limit = 10,
): Promise<{ name: string; qty: number }[]> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const itemMap: Record<string, number> = {};

  const drSnap = await fetchDailyReportsSince(storeId, sinceStr);
  if (drSnap && !drSnap.empty) {
    drSnap.docs.forEach(doc => {
      (doc.data().items || []).forEach((item: { name?: string; qty?: number }) => {
        const name = item.name?.trim();
        if (!name || name.length > 50) return;
        itemMap[name] = (itemMap[name] || 0) + Number(item.qty || 0);
      });
    });
  }

  if (Object.keys(itemMap).length === 0) {
    const sinceCompact = sinceStr.replace(/-/g, '');
    const detailSnap = await fetchPosSalesDetailSince(storeId, sinceCompact, 5000);
    detailSnap?.docs.forEach(doc => {
      const name = String(doc.data().goodsName || '').trim();
      if (!name) return;
      itemMap[name] = (itemMap[name] || 0) + Number(doc.data().saleCount || 0);
    });
  }

  return Object.entries(itemMap)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, qty]) => ({ name, qty }));
}

/** 매장 품목 판매 집계 — daily_reports → pos_sales_detail fallback */
export async function fetchStoreItemSales(
  storeId: string,
  days = 30,
  limit = 20,
): Promise<Array<{ name: string; qty: number; amount: number }>> {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = `${since.getFullYear()}-${String(since.getMonth() + 1).padStart(2, '0')}-${String(since.getDate()).padStart(2, '0')}`;
  const itemMap: Record<string, { qty: number; amount: number }> = {};

  const addItem = (name: string, qty: number, amount: number) => {
    const n = name.trim();
    if (!n || n.length > 50) return;
    if (!itemMap[n]) itemMap[n] = { qty: 0, amount: 0 };
    itemMap[n].qty += qty;
    itemMap[n].amount += amount;
  };

  const drSnap = await fetchDailyReportsSince(storeId, sinceStr);
  if (drSnap && !drSnap.empty) {
    const reports = drSnap.docs.map(d => ({
      ...d.data(),
      reportDate: d.data().reportDate as string,
      storeId: d.data().storeId as string,
      items: d.data().items as Array<{ name?: string; barcode?: string; qty?: number; netSales?: number; amount?: number }> | undefined,
    }));
    for (const d of pickBestReportByDate(reports, storeId).values()) {
      (d.items || []).forEach(item => {
        addItem(item.name || item.barcode || '', Number(item.qty || 0), Number(item.netSales || item.amount || 0));
      });
    }
  }

  if (Object.keys(itemMap).length === 0) {
    const sinceCompact = sinceStr.replace(/-/g, '');
    const detailSnap = await fetchPosSalesDetailSince(storeId, sinceCompact, 5000);
    detailSnap?.docs.forEach(doc => {
      const r = doc.data();
      addItem(String(r.goodsName || ''), Number(r.saleCount || 0), Number(r.totalPrice || 0));
    });
  }

  return Object.entries(itemMap)
    .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

/** 날짜별 품목 판매량 추이 — daily_reports → pos_sales_detail fallback */
export async function fetchDailyItemTrend(
  storeId: string,
  sinceYmd: string,
): Promise<{ dateMap: Record<string, Record<string, number>>; itemTotals: Record<string, number> }> {
  const dateMap: Record<string, Record<string, number>> = {};
  const itemTotals: Record<string, number> = {};

  const addItem = (date: string, name: string, qty: number) => {
    if (!date || !name || name.length > 50) return;
    if (!dateMap[date]) dateMap[date] = {};
    dateMap[date][name] = (dateMap[date][name] || 0) + qty;
    itemTotals[name] = (itemTotals[name] || 0) + qty;
  };

  if (storeId) {
    const drSnap = await fetchDailyReportsSince(storeId, sinceYmd);
    if (drSnap && !drSnap.empty) {
      const reports = drSnap.docs.map(d => ({
        ...d.data(),
        reportDate: d.data().reportDate as string,
        storeId: d.data().storeId as string,
        items: d.data().items as Array<{ name?: string; barcode?: string; qty?: number }> | undefined,
      }));
      for (const d of pickBestReportByDate(reports, storeId).values()) {
        const date = d.reportDate;
        (d.items || []).forEach((item: { name?: string; barcode?: string; qty?: number }) => {
          const name = (item.name || item.barcode || '').trim();
          addItem(date, name, Number(item.qty || 0));
        });
      }
    }
  }

  if (Object.keys(itemTotals).length === 0 && storeId) {
    const sinceCompact = sinceYmd.replace(/-/g, '');
    const detailSnap = await fetchPosSalesDetailSince(storeId, sinceCompact, 10000);
    detailSnap?.docs.forEach(doc => {
      const r = doc.data();
      const date = posDetailDateYmd(String(r.date || ''));
      const name = String(r.goodsName || '').trim();
      addItem(date, name, Number(r.saleCount || 0));
    });
  }

  return { dateMap, itemTotals };
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
