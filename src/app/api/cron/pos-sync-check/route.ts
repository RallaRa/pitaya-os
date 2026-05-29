import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// POS 동기화 지연 감지 — pos_sync_log 마지막 기록이 2시간 초과 시 알림
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const STALE_MS = 2 * 60 * 60 * 1000;
  const now = Date.now();
  let alerted = 0;

  const storesSnap = await adminDb.collection('stores').limit(50).get();

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    const logSnap = await adminDb.collection('pos_sync_log')
      .where('storeId', '==', storeId)
      .limit(30)
      .get()
      .catch(() => null);

    let lastSync: number | null = null;
    if (logSnap && !logSnap.empty) {
      for (const doc of logSnap.docs) {
        const ts = doc.data().syncedAt;
        const t = ts?.toDate?.()?.getTime() ?? (ts?.seconds ? ts.seconds * 1000 : null);
        if (t && (!lastSync || t > lastSync)) lastSync = t;
      }
    }

    if (lastSync && now - lastSync < STALE_MS) continue;

    const membersSnap = await adminDb.collection('user_store_map')
      .where('storeId', '==', storeId)
      .where('status', '==', 'active')
      .get();

    const batch = adminDb.batch();
    membersSnap.docs.forEach(m => {
      const ref = adminDb.collection('notifications').doc();
      batch.set(ref, {
        targetUid:  m.data().uid,
        senderUid:  '',
        senderName: 'Pitaya OS',
        type:       'pos_sync_stale',
        message:    lastSync
          ? `POS 동기화가 ${Math.round((now - lastSync) / 3600000)}시간 전입니다. bridge.js 상태를 확인하세요.`
          : 'POS 동기화 기록이 없습니다. bridge.js 연결을 확인하세요.',
        link:       '/dashboard/settings',
        isRead:     false,
        createdAt:  FieldValue.serverTimestamp(),
      });
    });
    if (!membersSnap.empty) {
      await batch.commit();
      alerted++;
    }
  }

  return NextResponse.json({ ok: true, storesAlerted: alerted });
}
