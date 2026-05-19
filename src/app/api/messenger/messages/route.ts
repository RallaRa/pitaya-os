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

    await adminDb.collection('chat_rooms').doc(roomId).update({
      lastMessage: text.slice(0, 50),
      lastMessageAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
