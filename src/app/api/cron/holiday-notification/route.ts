import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getUpcomingHolidayAlerts,
  holidayAlertMessage,
  HOLIDAY_ORDER_ALERT_DAYS_BEFORE,
  HOLIDAY_ORDER_ALERT_LEAD_DAYS,
  kstTodayStr,
} from '@/lib/kakao/holidays';
import { getKakaoLinkedActiveUserIds, notifyUser } from '@/lib/notifications/notifyUser';

const LEAD_DAYS = [...HOLIDAY_ORDER_ALERT_LEAD_DAYS];
const LINK = '/dashboard/hr/calendar';

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

async function runHolidayNotifications() {
  const todayStr = kstTodayStr();
  const alerts = getUpcomingHolidayAlerts(todayStr, LEAD_DAYS);
  if (!alerts.length) {
    return { ok: true, todayStr, sent: 0, alerts: 0 };
  }

  const userIds = await getKakaoLinkedActiveUserIds();
  let sent = 0;

  for (const alert of alerts) {
    const dedupeKey = `${alert.period.startDate}_${alert.daysBefore}`;
    for (const uid of userIds) {
      const sentRef = adminDb.collection('holiday_kakao_sent').doc(`${uid}_${dedupeKey}`);
      const sentSnap = await sentRef.get();
      if (sentSnap.exists) continue;

      const title =
        alert.daysBefore === 7 ? '📅 휴일 1주일 전 알림' :
        alert.daysBefore === HOLIDAY_ORDER_ALERT_DAYS_BEFORE ? '📅 휴일발주알림' :
        '📅 휴일 알림';
      const message = holidayAlertMessage(alert.period, alert.daysBefore);

      await notifyUser(uid, {
        title,
        message,
        link: LINK,
        type: 'holiday_alert',
      });

      await sentRef.set({
        uid,
        periodStart: alert.period.startDate,
        periodEnd: alert.period.endDate,
        daysBefore: alert.daysBefore,
        sentAt: FieldValue.serverTimestamp(),
      });
      sent++;
    }
  }

  return { ok: true, todayStr, sent, alerts: alerts.length, userCount: userIds.length };
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runHolidayNotifications();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'holiday notification failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
