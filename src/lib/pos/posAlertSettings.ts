import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export interface PosAlertSettings {
  realtimeSaleEnabled: boolean;
  dailyCloseEnabled: boolean;
  goodsSyncNotifyEnabled: boolean;
  itemSpeedAlertEnabled: boolean;
  firstPurchaseEnabled: boolean;
  vipVisitEnabled: boolean;
  regularVisitEnabled: boolean;
  discountAbuseEnabled: boolean;
  transactionAnomalyEnabled: boolean;
  repurchaseReminderEnabled: boolean;
  signageAutoSwitchEnabled: boolean;
}

export const DEFAULT_POS_ALERT_SETTINGS: PosAlertSettings = {
  realtimeSaleEnabled: true,
  dailyCloseEnabled: true,
  goodsSyncNotifyEnabled: true,
  itemSpeedAlertEnabled: true,
  firstPurchaseEnabled: true,
  vipVisitEnabled: true,
  regularVisitEnabled: false,
  discountAbuseEnabled: true,
  transactionAnomalyEnabled: true,
  repurchaseReminderEnabled: true,
  signageAutoSwitchEnabled: false,
};

export async function getPosAlertSettings(storeId: string): Promise<PosAlertSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = (doc.data()?.posAlerts || {}) as Partial<PosAlertSettings>;
  return { ...DEFAULT_POS_ALERT_SETTINGS, ...raw };
}

export async function savePosAlertSettings(
  storeId: string,
  patch: Partial<PosAlertSettings>,
): Promise<PosAlertSettings> {
  const current = await getPosAlertSettings(storeId);
  const merged = { ...current, ...patch };
  await adminDb.collection('store_settings').doc(storeId).set(
    { storeId, posAlerts: merged, updatedAt: FieldValue.serverTimestamp() },
    { merge: true },
  );
  return merged;
}
