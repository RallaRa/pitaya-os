import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { notifyUser } from '@/lib/notifications/notifyUser';
import {
  CALENDAR_LINK,
  EXPIRY_NOTIFICATION_TYPE,
} from '@/lib/expiryReminder/constants';

function formatDateKr(ymd: string) {
  return ymd.replace(/-/g, '.');
}

export async function processDueExpiryReminders(): Promise<{ sent: number; checked: number }> {
  const today = getKSTTodayYMD();
  const windowStart = addDaysYMD(today, -1);

  const snap = await adminDb.collection('expiry_reminders')
    .where('expiryDate', '>=', windowStart)
    .limit(500)
    .get();

  let sent = 0;
  let checked = 0;

  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.status !== 'active') continue;
    checked += 1;
    const expiryDate = String(data.expiryDate || '');
    const itemName = String(data.itemName || '품목');
    const createdBy = String(data.createdBy || '');
    const offsets = (Array.isArray(data.reminderOffsetsDays) ? data.reminderOffsetsDays : [7, 3, 1])
      .map(Number)
      .filter(d => d > 0);
    const sentMap: Record<string, boolean> = { ...(data.notificationsSent || {}) };
    let updated = false;

    for (const offsetDays of offsets) {
      const key = String(offsetDays);
      if (sentMap[key]) continue;

      const remindOn = addDaysYMD(expiryDate, -offsetDays);
      if (remindOn !== today) continue;

      if (createdBy) {
        const title = `[유통기한] ${itemName}`;
        const message = `유통기한 ${formatDateKr(expiryDate)} — ${offsetDays}일 전 알림 (${offsetDays}일 후 만료)`;
        await notifyUser(createdBy, {
          title,
          message,
          link: CALENDAR_LINK,
          type: EXPIRY_NOTIFICATION_TYPE,
        });
        sent += 1;
      }

      sentMap[key] = true;
      updated = true;
    }

    if (updated) {
      await doc.ref.update({
        notificationsSent: sentMap,
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
  }

  return { sent, checked };
}
