import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function kstNow() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return {
    hour:    kst.getUTCHours(),
    minute:  kst.getUTCMinutes(),
    dateStr: kst.toISOString().slice(0, 10),
  };
}

async function sendNotificationsToStore(
  storeId: string,
  title: string,
  message: string,
  link: string,
) {
  const membersSnap = await adminDb
    .collection('user_store_map')
    .where('storeId', '==', storeId)
    .get();
  if (membersSnap.empty) return 0;

  const batch = adminDb.batch();
  membersSnap.docs.forEach(m => {
    const ref = adminDb.collection('notifications').doc();
    batch.set(ref, {
      targetUid:  m.data().uid,
      senderUid:  '',
      senderName: 'Pitaya OS',
      type:       'hygiene_alert',
      title,
      message,
      link,
      isRead:     false,
      createdAt:  FieldValue.serverTimestamp(),
    });
  });
  await batch.commit();
  return membersSnap.size;
}

// KST 11:00~11:55 사이 5분 간격으로 실행됨 (UTC 02:00~02:55)
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { hour, minute, dateStr } = kstNow();

  // KST 11:00~11:55 범위 외에는 무시
  if (hour !== 11) {
    return NextResponse.json({ ok: true, skipped: true, reason: `kstHour=${hour} (not 11)` });
  }

  const storesSnap = await adminDb.collection('stores').get();
  let alerted = 0;
  let skipped = 0;

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    try {
      // 오늘 위생 점검일지 조회
      const checkSnap = await adminDb
        .collection('hygiene_checklists')
        .where('storeId', '==', storeId)
        .where('checkDate', '==', dateStr)
        .limit(1)
        .get();

      const data = checkSnap.empty ? null : checkSnap.docs[0].data();

      // 작업전(위생상태(작업전)) 완료 여부 확인
      const morningDone =
        data?.sections?.작업전?.completed === true ||
        data?.notifications?.morning === false;

      if (morningDone) {
        skipped++;
        continue;
      }

      const count = await sendNotificationsToStore(
        storeId,
        '🧹 위생점검일지 작성 알림',
        `작업전 위생점검을 아직 작성하지 않았습니다! (${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')} KST)`,
        '/dashboard/hygiene',
      );
      alerted += count;
    } catch {}
  }

  return NextResponse.json({ ok: true, dateStr, kstHour: hour, kstMinute: minute, alerted, skipped });
}
