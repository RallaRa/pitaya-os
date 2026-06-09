import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { firestoreTimestampToMillis } from '@/lib/dateUtils';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid   = searchParams.get('uid');
  const limit = Math.min(parseInt(searchParams.get('limit') || '20'), 50);

  if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });
  if (uid !== authUser.uid) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const snap = await adminDb.collection('notifications')
      .where('targetUid', '==', uid)
      .get();

    let notifications = snap.docs.map(doc => {
      const data = doc.data();
      const ms = firestoreTimestampToMillis(data.createdAt);
      return {
        id: doc.id,
        ...data,
        createdAt: ms != null ? new Date(ms).toISOString() : null,
      };
    }) as any[];
    notifications.sort((a, b) => {
      const ta = firestoreTimestampToMillis(a.createdAt) ?? 0;
      const tb = firestoreTimestampToMillis(b.createdAt) ?? 0;
      return tb - ta;
    });
    notifications = notifications.slice(0, limit);

    const unreadCount = notifications.filter(n => !n.isRead).length;
    return NextResponse.json({ notifications, unreadCount });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();

    // 전체 읽음 처리
    if (body.action === 'readAll' && body.uid) {
      if (body.uid !== authUser.uid) {
        return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
      }
      const snap = await adminDb.collection('notifications')
        .where('targetUid', '==', body.uid)
        .where('isRead', '==', false)
        .get();
      if (!snap.empty) {
        const batch = adminDb.batch();
        snap.docs.forEach(doc => batch.update(doc.ref, { isRead: true }));
        await batch.commit();
      }
      return NextResponse.json({ success: true });
    }

    // 단건 읽음 처리
    if (body.id) {
      await adminDb.collection('notifications').doc(body.id).update({ isRead: true });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { targetUid, senderUid, senderName, type, message, link } = await req.json();

    if (!targetUid || !type || !message) {
      return NextResponse.json({ error: '필수 항목 누락 (targetUid, type, message)' }, { status: 400 });
    }

    const ref = await adminDb.collection('notifications').add({
      targetUid,
      senderUid:  senderUid  || '',
      senderName: senderName || '',
      type,
      message,
      link:      link || '',
      isRead:    false,
      createdAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
