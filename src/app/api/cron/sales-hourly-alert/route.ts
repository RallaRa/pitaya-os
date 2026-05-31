import { NextResponse } from 'next/server';
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

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

async function runSalesHourlyAlerts() {
  const kstHour = getKSTHour();
  if (kstHour < SALES_ALERT_START_HOUR) {
    return { ok: true, skipped: true, reason: `before ${SALES_ALERT_START_HOUR}:00 KST`, kstHour };
  }

  const todayStr = getKSTTodayYMD();
  const storesSnap = await adminDb.collection('stores').get();
  let alerts = 0;
  let sent = 0;

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    const storeName = (storeDoc.data().storeName as string) || storeId;

    try {
      const result = await analyzeSalesHourlyDrop(storeId, kstHour, todayStr);
      if (!result?.triggered) continue;

      alerts += 1;
      const userIds = await getStoreActiveUserIds(storeId);
      if (!userIds.length) continue;

      const title = `📉 ${kstHour}시 매출 하락 알림 (${storeName})`;
      const link = '/dashboard/report/view';

      for (const uid of userIds) {
        const dedupeId = `${storeId}_${todayStr}_${kstHour}_${uid}`;
        const sentRef = adminDb.collection('sales_hourly_alert_sent').doc(dedupeId);
        const sentSnap = await sentRef.get();
        if (sentSnap.exists) continue;

        await notifyUser(uid, {
          title,
          message: result.message,
          link,
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
    } catch (e) {
      console.error('[sales-hourly-alert]', storeId, e);
    }
  }

  return { ok: true, kstHour, todayStr, alerts, sent };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runSalesHourlyAlerts();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'sales hourly alert failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
