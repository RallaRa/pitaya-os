import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD } from '@/lib/dateUtils';
import { pickBestReportByDate } from '@/lib/reportDedup';

export interface DailyItemStatRow {
  name: string;
  qty: number;
  amount: number;
  barcode?: string;
  categoryCode?: string;
  categoryName?: string;
}

export interface StoreDailyItemStatsDoc {
  storeId: string;
  date: string;
  items: Record<string, DailyItemStatRow>;
  itemCount: number;
  totalQty: number;
  totalAmount: number;
  source: string;
  syncedAt?: string;
}

type ItemWindowMap = Record<string, {
  qty: number;
  amount: number;
  days: Set<string>;
  w7: number;
  d7: Set<string>;
  wPrev7: number;
  dPrev7: Set<string>;
}>;

function normalizeItemKey(name: string): string | null {
  const n = name.trim();
  if (!n || n.length > 50) return null;
  return n;
}

export function buildDayItemsMap(
  items: Array<{
    name?: string;
    barcode?: string;
    qty?: number;
    amount?: number;
    netSales?: number;
    categoryCode?: string;
    categoryName?: string;
  }>,
): Record<string, DailyItemStatRow> {
  const map: Record<string, DailyItemStatRow> = {};
  for (const item of items) {
    const key = normalizeItemKey(String(item.name || item.barcode || ''));
    if (!key) continue;
    map[key] = {
      name: key,
      qty: Number(item.qty || 0),
      amount: Number(item.netSales ?? item.amount ?? 0),
      barcode: item.barcode || undefined,
      categoryCode: item.categoryCode || undefined,
      categoryName: item.categoryName || undefined,
    };
  }
  return map;
}

export async function upsertStoreDailyItemStats(
  storeId: string,
  date: string,
  items: Array<{
    name?: string;
    barcode?: string;
    qty?: number;
    amount?: number;
    netSales?: number;
    categoryCode?: string;
    categoryName?: string;
  }>,
  syncedAt?: string,
  source = 'pos_bridge',
): Promise<void> {
  if (!storeId || !date) return;
  const itemsMap = buildDayItemsMap(items);
  let totalQty = 0;
  let totalAmount = 0;
  for (const row of Object.values(itemsMap)) {
    totalQty += row.qty;
    totalAmount += row.amount;
  }
  await adminDb
    .collection('store_daily_item_stats')
    .doc(storeId)
    .collection('days')
    .doc(date)
    .set({
      storeId,
      date,
      items: itemsMap,
      itemCount: Object.keys(itemsMap).length,
      totalQty,
      totalAmount,
      source,
      syncedAt: syncedAt || new Date().toISOString(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
}

export async function fetchStoreDailyItemStatsSince(
  storeId: string,
  sinceYmd: string,
  endYmd: string,
): Promise<StoreDailyItemStatsDoc[]> {
  if (!storeId) return [];
  try {
    const snap = await adminDb
      .collection('store_daily_item_stats')
      .doc(storeId)
      .collection('days')
      .where('date', '>=', sinceYmd)
      .where('date', '<=', endYmd)
      .orderBy('date', 'asc')
      .limit(400)
      .get();
    return snap.docs.map(d => d.data() as StoreDailyItemStatsDoc);
  } catch (err) {
    console.warn('[storeDailyItemStats] range query failed, using fallback:', err);
    try {
      const snap = await adminDb
        .collection('store_daily_item_stats')
        .doc(storeId)
        .collection('days')
        .limit(400)
        .get();
      return snap.docs
        .map(d => d.data() as StoreDailyItemStatsDoc)
        .filter(d => d.date >= sinceYmd && d.date <= endYmd)
        .sort((a, b) => a.date.localeCompare(b.date));
    } catch {
      return [];
    }
  }
}

function addAggItemDay(
  map: ItemWindowMap,
  name: string,
  date: string,
  qty: number,
  amount: number,
  window: 'all' | 'last7' | 'prev7',
) {
  const n = normalizeItemKey(name);
  if (!n) return;
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

function foldDailyDocsIntoMap(
  days: StoreDailyItemStatsDoc[],
  todayYmd: string,
  sinceYmd: string,
): ItemWindowMap {
  const last7Start = addDaysYMD(todayYmd, -6);
  const prev7Start = addDaysYMD(todayYmd, -13);
  const prev7End = addDaysYMD(todayYmd, -7);
  const map: ItemWindowMap = {};

  for (const day of days) {
    const date = day.date;
    if (!date || date < sinceYmd || date > todayYmd) continue;
    let win: 'all' | 'last7' | 'prev7' | null = null;
    if (date >= last7Start) win = 'last7';
    else if (date >= prev7Start && date <= prev7End) win = 'prev7';

    for (const item of Object.values(day.items || {})) {
      const qty = Number(item.qty || 0);
      const amt = Number(item.amount || 0);
      addAggItemDay(map, item.name, date, qty, amt, 'all');
      if (win === 'last7') addAggItemDay(map, item.name, date, qty, amt, 'last7');
      if (win === 'prev7') addAggItemDay(map, item.name, date, qty, amt, 'prev7');
    }
  }
  return map;
}

export function rollupPredictionItemStatsFromDays(
  days: StoreDailyItemStatsDoc[],
  sinceYmd: string,
  todayYmd: string,
  limit: number,
): Array<{
  name: string;
  qty: number;
  amount: number;
  salesDays: number;
  dailyAvgSales: number;
  changeVsLastWeek: number;
}> {
  const map = foldDailyDocsIntoMap(days, todayYmd, sinceYmd);
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

export function rollupTopItems90FromDays(
  days: StoreDailyItemStatsDoc[],
  limit = 30,
): Array<{ name: string; qty: number; amount: number; days: number }> {
  const itemMap: Record<string, { qty: number; amount: number; days: Set<string> }> = {};
  for (const day of days) {
    for (const item of Object.values(day.items || {})) {
      const name = normalizeItemKey(item.name);
      if (!name) continue;
      if (!itemMap[name]) itemMap[name] = { qty: 0, amount: 0, days: new Set() };
      itemMap[name].qty += Number(item.qty || 0);
      itemMap[name].amount += Number(item.amount || 0);
      itemMap[name].days.add(day.date);
    }
  }
  return Object.entries(itemMap)
    .map(([name, v]) => ({ name, qty: v.qty, amount: v.amount, days: v.days.size }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, limit);
}

export function rollupWeeklyItemAggregatesFromDays(
  days: StoreDailyItemStatsDoc[],
  midYmd: string,
): {
  itemMap: Record<string, { name: string; qty: number; amount: number; days: Set<string> }>;
  prevItemMap: Record<string, { qty: number }>;
} {
  const itemMap: Record<string, { name: string; qty: number; amount: number; days: Set<string> }> = {};
  const prevItemMap: Record<string, { qty: number }> = {};

  for (const day of days) {
    const date = day.date;
    const isThisWeek = date >= midYmd;
    for (const item of Object.values(day.items || {})) {
      const name = normalizeItemKey(item.name);
      if (!name) continue;
      const qty = Number(item.qty || 0);
      const amount = Number(item.amount || 0);
      if (isThisWeek) {
        if (!itemMap[name]) itemMap[name] = { name, qty: 0, amount: 0, days: new Set() };
        itemMap[name].qty += qty;
        itemMap[name].amount += amount;
        itemMap[name].days.add(date);
      } else {
        if (!prevItemMap[name]) prevItemMap[name] = { qty: 0 };
        prevItemMap[name].qty += qty;
      }
    }
  }

  return { itemMap, prevItemMap };
}

/** daily_reports에서 누락된 집계 문서 보강 (관리/cron용) */
export async function backfillStoreDailyItemStatsFromDailyReports(
  storeId: string,
  sinceYmd: string,
  endYmd: string,
): Promise<number> {
  if (!storeId) return 0;
  let snap;
  try {
    snap = await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '>=', sinceYmd)
      .where('reportDate', '<=', endYmd)
      .orderBy('reportDate', 'asc')
      .limit(400)
      .get();
  } catch {
    snap = await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .limit(400)
      .get();
  }

  const reports = snap.docs.map(d => ({
    ...(d.data() as Record<string, unknown>),
    reportDate: d.data().reportDate as string,
    storeId: d.data().storeId as string,
    items: d.data().items as Array<{ name?: string; barcode?: string; qty?: number; netSales?: number; amount?: number }> | undefined,
    syncedAt: d.data().syncedAt as string | undefined,
  }));

  let written = 0;
  for (const report of pickBestReportByDate(reports, storeId).values()) {
    const date = report.reportDate;
    if (!date || date < sinceYmd || date > endYmd) continue;
    const existing = await adminDb
      .collection('store_daily_item_stats')
      .doc(storeId)
      .collection('days')
      .doc(date)
      .get();
    if (existing.exists) continue;
    const row = report as typeof reports[number];
    await upsertStoreDailyItemStats(
      storeId,
      date,
      row.items || [],
      String(row.syncedAt || ''),
      'daily_reports_backfill',
    );
    written += 1;
  }
  return written;
}
