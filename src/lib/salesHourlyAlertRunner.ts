import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { notifyUser } from '@/lib/notifications/notifyUser';
import {
  buildSalesHourlyHubMessage,
  buildSalesHourlyKakaoListItems,
} from '@/lib/kakao/salesAlertKakao';
import {
  analyzeSalesHourlyDrop,
  analyzeSalesHourlyRise,
  getKSTHour,
  getStoreActiveUserIds,
  SALES_ALERT_START_HOUR,
} from '@/lib/salesHourlyAlert';

async function sendHourlyAlert(opts: {
  storeId: string;
  todayStr: string;
  kstHour: number;
  uid: string;
  collection: string;
  title: string;
  message: string;
  type: 'sales_hourly_drop' | 'sales_hourly_rise';
  listHeader: string;
  listItems: { title: string; description: string }[];
  extra: Record<string, unknown>;
}): Promise<boolean> {
  const dedupeId = `${opts.storeId}_${opts.todayStr}_${opts.kstHour}_${opts.uid}`;
  const sentRef = adminDb.collection(opts.collection).doc(dedupeId);
  const sentSnap = await sentRef.get();
  if (sentSnap.exists) return false;

  await notifyUser(opts.uid, {
    title: opts.title,
    message: opts.message,
    link: '/dashboard/report/view',
    type: opts.type,
    listHeader: opts.listHeader,
    listItems: opts.listItems,
    buttonTitle: '매출 보고서',
  });

  await sentRef.set({
    storeId: opts.storeId,
    uid: opts.uid,
    date: opts.todayStr,
    hour: opts.kstHour,
    sentAt: FieldValue.serverTimestamp(),
    ...opts.extra,
  });
  return true;
}

export async function runSalesHourlyAlertsForStore(storeId: string, storeName?: string) {
  const kstHour = getKSTHour();
  if (kstHour < SALES_ALERT_START_HOUR) {
    return { skipped: true, reason: `before ${SALES_ALERT_START_HOUR}:00 KST`, kstHour };
  }

  const todayStr = getKSTTodayYMD();
  const name = storeName || storeId;
  const userIds = await getStoreActiveUserIds(storeId);

  const dropResult = await analyzeSalesHourlyDrop(storeId, kstHour, todayStr);
  const riseResult = await analyzeSalesHourlyRise(storeId, kstHour, todayStr);

  let dropSent = 0;
  let riseSent = 0;

  if (dropResult?.triggered) {
    const listItems = buildSalesHourlyKakaoListItems({
      direction: 'down',
      hour: kstHour,
      todayTotal: dropResult.todayTotal,
      benchmarks: dropResult.drops,
      focusItems: dropResult.focusItems,
    });
    const hubMessage = buildSalesHourlyHubMessage({
      direction: 'down',
      hour: kstHour,
      todayTotal: dropResult.todayTotal,
      benchmarks: dropResult.drops,
      focusItems: dropResult.focusItems,
    });
    for (const uid of userIds) {
      const ok = await sendHourlyAlert({
        storeId,
        todayStr,
        kstHour,
        uid,
        collection: 'sales_hourly_alert_sent',
        title: `📉 ${kstHour}시 매출 하락 (${name})`,
        message: hubMessage,
        type: 'sales_hourly_drop',
        listHeader: `📉 ${kstHour}시 순매출 하락`,
        listItems,
        extra: {
          todayTotal: dropResult.todayTotal,
          drops: dropResult.drops,
          focusItems: dropResult.focusItems,
        },
      });
      if (ok) dropSent += 1;
    }
  }

  if (riseResult?.triggered) {
    const listItems = buildSalesHourlyKakaoListItems({
      direction: 'up',
      hour: kstHour,
      todayTotal: riseResult.todayTotal,
      benchmarks: riseResult.rises,
      focusItems: riseResult.focusItems,
    });
    const hubMessage = buildSalesHourlyHubMessage({
      direction: 'up',
      hour: kstHour,
      todayTotal: riseResult.todayTotal,
      benchmarks: riseResult.rises,
      focusItems: riseResult.focusItems,
    });
    for (const uid of userIds) {
      const ok = await sendHourlyAlert({
        storeId,
        todayStr,
        kstHour,
        uid,
        collection: 'sales_hourly_rise_alert_sent',
        title: `📈 ${kstHour}시 매출 상승 (${name})`,
        message: hubMessage,
        type: 'sales_hourly_rise',
        listHeader: `📈 ${kstHour}시 순매출 상승`,
        listItems,
        extra: {
          todayTotal: riseResult.todayTotal,
          rises: riseResult.rises,
          focusItems: riseResult.focusItems,
        },
      });
      if (ok) riseSent += 1;
    }
  }

  return {
    kstHour,
    todayStr,
    dropTriggered: !!dropResult?.triggered,
    riseTriggered: !!riseResult?.triggered,
    dropSent,
    riseSent,
    triggered: !!(dropResult?.triggered || riseResult?.triggered),
    sent: dropSent + riseSent,
  };
}

export async function runSalesHourlyAlertsAllStores() {
  const kstHour = getKSTHour();
  if (kstHour < SALES_ALERT_START_HOUR) {
    return { ok: true, skipped: true, reason: `before ${SALES_ALERT_START_HOUR}:00 KST`, kstHour };
  }

  const storesSnap = await adminDb.collection('stores').get();
  let dropAlerts = 0;
  let riseAlerts = 0;
  let sent = 0;

  for (const storeDoc of storesSnap.docs) {
    try {
      const r = await runSalesHourlyAlertsForStore(
        storeDoc.id,
        (storeDoc.data().storeName as string) || storeDoc.id,
      );
      if (r.dropTriggered) dropAlerts += 1;
      if (r.riseTriggered) riseAlerts += 1;
      sent += r.sent || 0;
    } catch (e) {
      console.error('[sales-hourly-alert]', storeDoc.id, e);
    }
  }

  return { ok: true, kstHour, dropAlerts, riseAlerts, alerts: dropAlerts + riseAlerts, sent };
}
