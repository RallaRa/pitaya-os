import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function POST(req: Request) {
  try {
    const { roomId, senderUid, text, senderName } = await req.json();
    if (!roomId || !senderUid || !text) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    await adminDb.collection('chat_messages').add({
      roomId,
      senderUid,
      senderName: senderName || '',
      text,
      createdAt: FieldValue.serverTimestamp(),
      readBy: [senderUid],
    });

    const roomDoc = await adminDb.collection('chat_rooms').doc(roomId).get();
    const members: string[] = roomDoc.data()?.members || [];
    const currentUnreadCounts: Record<string, number> = roomDoc.data()?.unreadCount || {};

    const roomUpdate: Record<string, any> = {
      lastMessage: text.slice(0, 50),
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    members.forEach((uid: string) => {
      if (uid !== senderUid) {
        roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
      }
    });

    await adminDb.collection('chat_rooms').doc(roomId).update(roomUpdate);

    // 채팅방 밖에 있는 수신자에게만 알림 생성 (unreadCount !== 0 → 방 밖에 있음)
    const notifyTargets = members.filter(
      (uid: string) => uid !== senderUid && currentUnreadCounts[uid] !== 0
    );
    if (notifyTargets.length > 0) {
      await Promise.all(
        notifyTargets.map((uid: string) =>
          adminDb.collection('notifications').add({
            targetUid: uid,
            senderUid,
            senderName: senderName || '',
            type: 'message',
            message: `${senderName || '메시지'}: ${text.slice(0, 50)}`,
            link: '/dashboard/messenger',
            isRead: false,
            createdAt: FieldValue.serverTimestamp(),
          })
        )
      );
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const { action, roomId, uid } = await req.json();
    if (action !== 'readAll' || !roomId || !uid) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    // 해당 방에서 내가 readBy에 없는 메시지 전체에 uid 추가
    const msgsSnap = await adminDb.collection('chat_messages')
      .where('roomId', '==', roomId)
      .get();

    const unreadDocs = msgsSnap.docs.filter(d => {
      const readBy: string[] = d.data().readBy || [];
      return !readBy.includes(uid);
    });

    if (unreadDocs.length > 0) {
      const batch = adminDb.batch();
      unreadDocs.forEach(d => batch.update(d.ref, { readBy: FieldValue.arrayUnion(uid) }));
      await batch.commit();
    }

    // unreadCount 초기화
    await adminDb.collection('chat_rooms').doc(roomId).update({
      [`unreadCount.${uid}`]: 0,
    });

    return NextResponse.json({ success: true, updated: unreadDocs.length });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
