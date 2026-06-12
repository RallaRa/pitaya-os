import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { HometaxSyncResult } from '@/lib/purchase/hometaxTypes';

export type HometaxSyncTrigger = 'manual' | 'cron';

export interface HometaxSyncLogRecord {
  id?: string;
  storeId: string;
  uid: string;
  trigger: HometaxSyncTrigger;
  startDate: string;
  endDate: string;
  ok: boolean;
  sessionValid: boolean;
  message: string;
  imported: HometaxSyncResult['imported'];
  skipped: HometaxSyncResult['skipped'];
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
}

function tsToIso(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  if (typeof v === 'object' && v !== null && '_seconds' in v) {
    return new Date(Number((v as { _seconds: number })._seconds) * 1000).toISOString();
  }
  return null;
}

export async function appendHometaxSyncLog(params: {
  storeId: string;
  uid: string;
  trigger: HometaxSyncTrigger;
  startDate: string;
  endDate: string;
  startedAt: Date;
  result: HometaxSyncResult;
}) {
  await adminDb.collection('hometax_sync_logs').add({
    storeId: params.storeId,
    uid: params.uid,
    trigger: params.trigger,
    startDate: params.startDate,
    endDate: params.endDate,
    ok: params.result.ok,
    sessionValid: params.result.sessionValid,
    message: params.result.message,
    imported: params.result.imported,
    skipped: params.result.skipped,
    errors: params.result.errors,
    startedAt: params.startedAt,
    completedAt: FieldValue.serverTimestamp(),
  });
}

export async function listHometaxSyncLogs(
  storeId: string,
  limit = 15,
): Promise<HometaxSyncLogRecord[]> {
  const snap = await adminDb.collection('hometax_sync_logs')
    .where('storeId', '==', storeId)
    .orderBy('completedAt', 'desc')
    .limit(limit)
    .get();

  return snap.docs.map(d => {
    const data = d.data();
    return {
      id: d.id,
      storeId: String(data.storeId || ''),
      uid: String(data.uid || ''),
      trigger: (data.trigger as HometaxSyncTrigger) || 'manual',
      startDate: String(data.startDate || ''),
      endDate: String(data.endDate || ''),
      ok: Boolean(data.ok),
      sessionValid: Boolean(data.sessionValid),
      message: String(data.message || ''),
      imported: data.imported || { tax_invoice: 0, cash_receipt: 0, card: 0, total: 0 },
      skipped: data.skipped || { tax_invoice: 0, cash_receipt: 0, card: 0, total: 0 },
      errors: Array.isArray(data.errors) ? data.errors.map(String) : [],
      startedAt: tsToIso(data.startedAt),
      completedAt: tsToIso(data.completedAt),
    };
  });
}
