import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { notifyUser } from '@/lib/notifications/notifyUser';
import {
  analyzeSalesHourlyDrop,
  getKSTHour,
  getStoreActiveUserIds,
  SALES_ALERT_START_HOUR,
} from '@/lib/salesHourlyAlert';

export async function runSalesHourlyAlertsForStore(storeId: string, storeName?: string) {
  const kstHour = getKSTHour();
  if (kstHour < SALES_ALERT_START_HOUR) {
    return { skipped: true, reason: `before ${SALES_ALERT_START_HOUR}:00 KST`, kstHour };
  }

  const todayStr = getKSTTodayYMD();
  const result = await analyzeSalesHourlyDrop(storeId, kstHour, todayStr);
  if (!result?.triggered) {
    return { triggered: false, kstHour, todayStr };
  }

  const name = storeName || storeId;
  const userIds = await getStoreActiveUserIds(storeId);
  let sent = 0;

  for (const uid of userIds) {
    const dedupeId = `${storeId}_${todayStr}_${kstHour}_${uid}`;
    const sentRef = adminDb.collection('sales_hourly_alert_sent').doc(dedupeId);
    const sentSnap = await sentRef.get();
    if (sentSnap.exists) continue;

    await notifyUser(uid, {
      title: `📉 ${kstHour}시 매출 하락 알림 (${name})`,
      message: result.message,
      link: '/dashboard/report/view',
      type: 'sales_hourly_drop',
    });

    await sentRef.set({
      storeId,
      uid,
      date: todayStr,
      hour: kstHour,
      todayTotal: result.todayTotal,
      drops: result.drops,
      focusItems: result.focusItems,
      sentAt: FieldValue.serverTimestamp(),
    });
    sent += 1;
  }

  return { triggered: true, kstHour, todayStr, sent, drops: result.drops.length };
}

export async function runSalesHourlyAlertsAllStores() {
  const kstHour = getKSTHour();
  if (kstHour < SALES_ALERT_START_HOUR) {
    return { ok: true, skipped: true, reason: `before ${SALES_ALERT_START_HOUR}:00 KST`, kstHour };
  }

  const storesSnap = await adminDb.collection('stores').get();
  let alerts = 0;
  let sent = 0;

  for (const storeDoc of storesSnap.docs) {
    try {
      const r = await runSalesHourlyAlertsForStore(
        storeDoc.id,
        (storeDoc.data().storeName as string) || storeDoc.id,
      );
      if (r.triggered) {
        alerts += 1;
        sent += r.sent || 0;
      }
    } catch (e) {
      console.error('[sales-hourly-alert]', storeDoc.id, e);
    }
  }

  return { ok: true, kstHour, alerts, sent };
}
