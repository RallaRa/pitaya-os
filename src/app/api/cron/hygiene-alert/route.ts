import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isCronAuthorized, cronUnauthorizedResponse, getCronSecret } from '@/lib/cronAuth';
import {
  getReminderKind,
  kstDateParts,
  needsHygieneReminder,
  parseReminderKindParam,
  REMINDER_MESSAGES,
  type ReminderKind,
} from '@/lib/hygieneSchedule';

async function sendNotificationsToStore(
  storeId: string,
  kind: ReminderKind,
) {
  const { title, message } = REMINDER_MESSAGES[kind];
  const membersSnap = await adminDb
    .collection('user_store_map')
    .where('storeId', '==', storeId)
    .get();
  if (membersSnap.empty) return 0;

  const batch = adminDb.batch();
  membersSnap.docs.forEach(m => {
    const ref = adminDb.collection('notifications').doc();
    batch.set(ref, {
      targetUid: m.data().uid,
      senderUid: '',
      senderName: 'Pitaya OS',
      type: 'hygiene_alert',
      title,
      message,
      link: '/dashboard/hygiene',
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return membersSnap.size;
}

/** KST 11시 / 14시 / 20:30 — 미완료 시 매장 전체 알림 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const { hour, minute, dateStr } = kstDateParts();
  const forcedKind = parseReminderKindParam(new URL(req.url).searchParams.get('kind'));
  const kind = forcedKind ?? getReminderKind(hour, minute);
  if (!kind) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `kst ${hour}:${minute} — not a reminder window (use ?kind=morning|midday|closing)`,
    });
  }

  const storesSnap = await adminDb.collection('stores').get();
  let alerted = 0;
  let skipped = 0;

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    try {
      const checkSnap = await adminDb
        .collection('hygiene_checklists')
        .where('storeId', '==', storeId)
        .where('checkDate', '==', dateStr)
        .limit(1)
        .get();

      const data = checkSnap.empty ? null : checkSnap.docs[0].data();
      if (data?.notificationsSent?.[kind] === true) {
        skipped++;
        continue;
      }

      if (!needsHygieneReminder(data, kind)) {
        skipped++;
        continue;
      }

      const count = await sendNotificationsToStore(storeId, kind);
      alerted += count;

      const docRef = checkSnap.empty
        ? adminDb.collection('hygiene_checklists').doc(`${storeId}_${dateStr}`)
        : checkSnap.docs[0].ref;

      await docRef.set({
        storeId,
        checkDate: dateStr,
        [`notificationsSent.${kind}`]: true,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    } catch {
      /* store loop */
    }
  }

  return NextResponse.json({
    ok: true,
    dateStr,
    kind,
    kstHour: hour,
    kstMinute: minute,
    alerted,
    skipped,
  });
}
