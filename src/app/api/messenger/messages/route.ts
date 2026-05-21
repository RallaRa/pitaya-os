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

    // 채팅방 정보 조회 (멤버 목록으로 상대방 unreadCount 증가)
    const roomDoc = await adminDb.collection('chat_rooms').doc(roomId).get();
    const members: string[] = roomDoc.data()?.members || [];

    const roomUpdate: Record<string, any> = {
      lastMessage: text.slice(0, 50),
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    // 발신자를 제외한 모든 멤버의 unreadCount 증가
    members.forEach((uid: string) => {
      if (uid !== senderUid) {
        roomUpdate[`unreadCount.${uid}`] = FieldValue.increment(1);
      }
    });

    await adminDb.collection('chat_rooms').doc(roomId).update(roomUpdate);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
