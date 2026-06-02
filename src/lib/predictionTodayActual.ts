/**
 * 예측 품목 — 당일(오늘) 실매출 vs 예측 비교 (30분 POS 갱신 / AI는 슬롯 4회)
 */
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { predictionCacheDocId } from '@/lib/predictionDailyLock';
import { dailyReportDocId } from '@/lib/reportCompare';
import { itemNamesMatch } from '@/lib/itemNameMatch';

/** 당일 실매출(POS) 갱신 주기 — AI 예측(00·10·15·18)과 분리 */
export const PREDICTION_POS_REFRESH_MS = 30 * 60 * 1000;

export const PREDICTION_POS_REFRESH_LABEL = '당일 실매출 30분마다 · AI 예측 00·10·15·18시';

function ymdCompact(ymd: string): string {
  return ymd.replace(/-/g, '');
}

function mergeAmounts(
  map: Record<string, number>,
  items: Array<{ name?: string; netSales?: number; amount?: number }>,
) {
  items.forEach(it => {
    const name = String(it.name || '').trim();
    if (!name) return;
    const amt = Number(it.netSales ?? it.amount ?? 0);
    map[name] = (map[name] || 0) + amt;
  });
}

async function fetchDailyReportItems(storeId: string, dateYmd: string) {
  const byId = await adminDb.collection('daily_reports').doc(dailyReportDocId(storeId, dateYmd)).get();
  if (byId.exists) {
    return (byId.data()?.items || []) as Array<{ name?: string; netSales?: number; amount?: number }>;
  }
  const q = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '==', dateYmd)
    .limit(3)
    .get();
  if (!q.empty) return (q.docs[0].data().items || []) as Array<{ name?: string; netSales?: number; amount?: number }>;
  return [];
}

async function fetchPosDetailItemsToday(storeId: string, todayYmd: string) {
  const compact = ymdCompact(todayYmd);
  const map: Record<string, number> = {};
  try {
    const snap = await adminDb.collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .where('date', '==', compact)
      .limit(2000)
      .get();
    snap.docs.forEach(doc => {
      const r = doc.data();
      const name = String(r.goodsName || '').trim();
      if (!name) return;
      map[name] = (map[name] || 0) + Number(r.totalPrice || 0);
    });
  } catch {
    try {
      const snap = await adminDb.collection('pos_sales_detail')
        .where('storeId', '==', storeId)
        .limit(3000)
        .get();
      snap.docs.forEach(doc => {
        if (String(doc.data().date || '') !== compact) return;
        const name = String(doc.data().goodsName || '').trim();
        if (!name) return;
        map[name] = (map[name] || 0) + Number(doc.data().totalPrice || 0);
      });
    } catch { /* ignore */ }
  }
  return map;
}

export interface TodayItemSalesContext {
  hasTodayData: boolean;
  amounts: Record<string, number>;
}

export async function fetchTodayItemSalesContext(
  storeId: string,
  todayYmd: string,
): Promise<TodayItemSalesContext> {
  const amounts: Record<string, number> = {};
  const reportItems = await fetchDailyReportItems(storeId, todayYmd);
  if (reportItems.length > 0) {
    mergeAmounts(amounts, reportItems);
    return { hasTodayData: true, amounts };
  }

  const posMap = await fetchPosDetailItemsToday(storeId, todayYmd);
  if (Object.keys(posMap).length > 0) {
    Object.assign(amounts, posMap);
    return { hasTodayData: true, amounts };
  }

  return { hasTodayData: false, amounts };
}

export function resolveTodayItemAmount(
  itemName: string,
  ctx: TodayItemSalesContext,
): number | null {
  if (!ctx.hasTodayData) return null;
  let total = 0;
  let matched = false;
  for (const [key, amt] of Object.entries(ctx.amounts)) {
    if (itemNamesMatch(itemName, key)) {
      total += amt;
      matched = true;
    }
  }
  return matched ? total : 0;
}

export function attachTodayActualToPredictionItems<T extends Record<string, unknown>>(
  items: T[] | undefined,
  ctx: TodayItemSalesContext,
): T[] {
  if (!items?.length) return items || [];
  return items.map(raw => {
    const name = String(raw.item || '').trim();
    const predicted = Number(raw.dailyAvgSales ?? raw.expectedSales) || 0;
    const actual = resolveTodayItemAmount(name, ctx);
    if (actual == null) {
      return { ...raw, todayActualSales: null, vsPredictedDiff: null, vsPredictedPct: null };
    }
    const diff = actual - predicted;
    const pct = predicted > 0 ? Math.round((diff / predicted) * 100) : (actual > 0 ? 100 : 0);
    return {
      ...raw,
      todayActualSales: actual,
      vsPredictedDiff: diff,
      vsPredictedPct: pct,
    };
  });
}

export async function enrichPredictionItemsWithTodayActual(
  storeId: string,
  todayYmd: string,
  payload: {
    topItems?: Array<Record<string, unknown>>;
    baseTopItems?: Array<Record<string, unknown>>;
    bottomItems?: Array<Record<string, unknown>>;
  },
) {
  if (!storeId) return payload;
  const ctx = await fetchTodayItemSalesContext(storeId, todayYmd);
  return {
    ...payload,
    topItems: attachTodayActualToPredictionItems(payload.topItems, ctx),
    baseTopItems: attachTodayActualToPredictionItems(payload.baseTopItems, ctx),
    bottomItems: attachTodayActualToPredictionItems(payload.bottomItems, ctx),
    todaySalesAsOf: todayYmd,
    hasTodaySalesData: ctx.hasTodayData,
    todayActualUpdatedAt: new Date().toISOString(),
  };
}

function timestampToMs(ts: unknown): number | null {
  if (!ts) return null;
  if (typeof ts === 'string') {
    const n = Date.parse(ts);
    return Number.isNaN(n) ? null : n;
  }
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts && typeof (ts as { toDate: () => Date }).toDate === 'function') {
    return (ts as { toDate: () => Date }).toDate().getTime();
  }
  return null;
}

export function isTodayActualCacheFresh(todayActualUpdatedAt: unknown, now = Date.now()): boolean {
  const ms = timestampToMs(todayActualUpdatedAt);
  if (ms == null) return false;
  return now - ms < PREDICTION_POS_REFRESH_MS;
}

/** Firestore 예측 캐시에 당일 실매출만 반영 (AI·품목 예측 본문은 유지) */
export async function refreshStoreTodayActualSales(
  storeId: string,
  todayYmd = getKSTTodayYMD(),
): Promise<{ ok: boolean; reason?: string; hasTodaySalesData?: boolean }> {
  if (!storeId) return { ok: false, reason: 'no storeId' };

  const cacheRef = adminDb.collection('predictions').doc(predictionCacheDocId(storeId, todayYmd));
  const snap = await cacheRef.get();
  if (!snap.exists) return { ok: false, reason: 'no prediction cache' };

  const d = snap.data()!;
  if (String(d.predictionDate || '') !== todayYmd) {
    return { ok: false, reason: 'stale prediction date' };
  }

  const enriched = await enrichPredictionItemsWithTodayActual(storeId, todayYmd, {
    topItems: (d.topItems as Array<Record<string, unknown>>) || [],
    baseTopItems: (d.baseTopItems as Array<Record<string, unknown>>) || [],
    bottomItems: (d.bottomItems as Array<Record<string, unknown>>) || [],
  });

  await cacheRef.set({
    topItems: enriched.topItems,
    baseTopItems: enriched.baseTopItems,
    bottomItems: enriched.bottomItems,
    hasTodaySalesData: enriched.hasTodaySalesData,
    todaySalesAsOf: enriched.todaySalesAsOf,
    todayActualUpdatedAt: enriched.todayActualUpdatedAt,
    posRefreshSchedule: PREDICTION_POS_REFRESH_LABEL,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { ok: true, hasTodaySalesData: enriched.hasTodaySalesData };
}

export async function refreshAllStoresTodayActualSales(todayYmd = getKSTTodayYMD()) {
  const storesSnap = await adminDb.collection('stores').get();
  const results = await Promise.allSettled(
    storesSnap.docs.map(doc => refreshStoreTodayActualSales(doc.id, todayYmd)),
  );
  const ok = results.filter(r => r.status === 'fulfilled' && r.value.ok).length;
  return { total: storesSnap.size, ok };
}
