import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { dailyReportDocId } from '@/lib/reportCompare';
import type { BriefingActionParams, BriefingActionType } from '@/lib/briefingActions';
import type {
  BriefingActionAttributionMetrics,
  BriefingActionLogRecord,
  BriefingActionLogStatus,
} from '@/lib/briefing/briefingActionLog.types';

export type {
  BriefingActionAttributionMetrics,
  BriefingActionLogRecord,
  BriefingActionLogStatus,
} from '@/lib/briefing/briefingActionLog.types';

import {
  getDisplayNetSales,
  posDailySalesDocId,
  type SalesDocData,
} from '@/lib/posDailySales';

async function loadNetSalesForDate(storeId: string, dateYmd: string): Promise<number> {
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

export async function computeBriefingActionAttribution(
  storeId: string,
  executeDateYmd: string,
): Promise<BriefingActionAttributionMetrics> {
  const today = getKSTTodayYMD();
  const baselineDates = [-3, -2, -1].map(d => addDaysYMD(executeDateYmd, d));

  let baselineSum = 0;
  let baselineCount = 0;
  for (const ymd of baselineDates) {
    const net = await loadNetSalesForDate(storeId, ymd);
    if (net > 0) {
      baselineSum += net;
      baselineCount += 1;
    }
  }
  const baselineAvg = baselineCount > 0 ? Math.round(baselineSum / baselineCount) : 0;

  let impactSum = 0;
  let impactCount = 0;
  for (let d = 1; d <= 7; d += 1) {
    const ymd = addDaysYMD(executeDateYmd, d);
    if (ymd > today) break;
    const net = await loadNetSalesForDate(storeId, ymd);
    if (net > 0) {
      impactSum += net;
      impactCount += 1;
    }
  }
  const impactAvg = impactCount > 0 ? Math.round(impactSum / impactCount) : 0;

  const daysSinceExecute = Math.max(0, Math.floor(
    (new Date(`${today}T12:00:00+09:00`).getTime() - new Date(`${executeDateYmd}T12:00:00+09:00`).getTime())
    / (24 * 60 * 60 * 1000),
  ));
  const trackingDaysLeft = Math.max(0, 7 - daysSinceExecute);

  const deltaPct = baselineAvg > 0 && impactCount > 0
    ? Math.round(((impactAvg - baselineAvg) / baselineAvg) * 100)
    : null;

  return {
    baselineAvg,
    impactAvg,
    deltaPct,
    baselineDays: baselineCount,
    impactDays: impactCount,
    trackingDaysLeft,
    calculatedAt: new Date().toISOString(),
  };
}

export async function createBriefingActionLog(input: {
  storeId: string;
  actionType: BriefingActionType;
  text: string;
  basis?: string;
  params?: BriefingActionParams;
  briefingDateYmd?: string;
  uid?: string;
}): Promise<{ id: string }> {
  const executeDateYmd = getKSTTodayYMD();
  const ref = await adminDb.collection('store_briefing_actions').add({
    storeId: input.storeId,
    executeDateYmd,
    briefingDateYmd: input.briefingDateYmd || executeDateYmd,
    actionType: input.actionType,
    text: input.text,
    basis: input.basis || '',
    params: input.params || null,
    status: 'started',
    startedAt: FieldValue.serverTimestamp(),
    createdBy: input.uid || null,
  });
  return { id: ref.id };
}

export async function completeBriefingActionLog(input: {
  logId: string;
  storeId: string;
  result?: Record<string, unknown>;
}): Promise<BriefingActionAttributionMetrics | null> {
  const ref = adminDb.collection('store_briefing_actions').doc(input.logId);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  if (data.storeId !== input.storeId) return null;

  const executeDateYmd = String(data.executeDateYmd || getKSTTodayYMD());
  const attribution = await computeBriefingActionAttribution(input.storeId, executeDateYmd);

  await ref.set({
    status: 'completed',
    completedAt: FieldValue.serverTimestamp(),
    result: input.result || null,
    attribution,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return attribution;
}

function serializeLog(doc: QueryDocumentSnapshot): BriefingActionLogRecord {
  const data = doc.data();
  const startedAt = data.startedAt?.toDate?.()?.toISOString?.()
    || data.startedAt
    || '';
  const completedAt = data.completedAt?.toDate?.()?.toISOString?.()
    || data.completedAt
    || undefined;

  return {
    id: doc.id,
    storeId: String(data.storeId || ''),
    executeDateYmd: String(data.executeDateYmd || ''),
    briefingDateYmd: data.briefingDateYmd ? String(data.briefingDateYmd) : undefined,
    actionType: data.actionType as BriefingActionType,
    text: String(data.text || ''),
    basis: data.basis ? String(data.basis) : undefined,
    params: data.params || undefined,
    status: (data.status || 'started') as BriefingActionLogStatus,
    startedAt: typeof startedAt === 'string' ? startedAt : '',
    completedAt: typeof completedAt === 'string' ? completedAt : undefined,
    result: data.result || undefined,
    attribution: data.attribution || undefined,
  };
}

export async function fetchBriefingActionAttribution(
  storeId: string,
  daysBack = 7,
): Promise<{
  actions: BriefingActionLogRecord[];
  summary: {
    total: number;
    completed: number;
    tracking: number;
    avgDeltaPct: number | null;
    positiveCount: number;
  };
}> {
  const sinceYmd = addDaysYMD(getKSTTodayYMD(), -daysBack);
  const snap = await adminDb.collection('store_briefing_actions')
    .where('storeId', '==', storeId)
    .where('executeDateYmd', '>=', sinceYmd)
    .limit(50)
    .get();

  const actions = snap.docs
    .map(serializeLog)
    .sort((a, b) => b.executeDateYmd.localeCompare(a.executeDateYmd)
      || b.startedAt.localeCompare(a.startedAt));

  const enriched = await Promise.all(actions.map(async (action) => {
    if (action.status !== 'completed') return action;
    const attribution = await computeBriefingActionAttribution(storeId, action.executeDateYmd);
    return { ...action, attribution };
  }));

  const completedWithDelta = enriched.filter(a =>
    a.status === 'completed' && a.attribution?.deltaPct != null,
  );
  const avgDeltaPct = completedWithDelta.length > 0
    ? Math.round(
      completedWithDelta.reduce((s, a) => s + (a.attribution!.deltaPct || 0), 0)
      / completedWithDelta.length,
    )
    : null;

  return {
    actions: enriched,
    summary: {
      total: enriched.length,
      completed: enriched.filter(a => a.status === 'completed').length,
      tracking: enriched.filter(a =>
        a.status === 'completed'
        && (a.attribution?.trackingDaysLeft ?? 7) > 0,
      ).length,
      avgDeltaPct,
      positiveCount: completedWithDelta.filter(a => (a.attribution!.deltaPct || 0) > 0).length,
    },
  };
}
