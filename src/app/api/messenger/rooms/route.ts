import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: 'uid 없음' }, { status: 400 });

    const snap = await adminDb.collection('chat_rooms')
      .where('members', 'array-contains', uid)
      .where('status', '==', 'active')
      .orderBy('updatedAt', 'desc')
      .get();

    const rooms = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ rooms });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid, targetUid, storeId } = await req.json();
    if (!uid || !targetUid) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const snap = await adminDb.collection('chat_rooms')
      .where('type', '==', 'direct')
      .where('members', 'array-contains', uid)
      .get();

    const existing = snap.docs.find(d => {
      const members = d.data().members || [];
      return members.includes(targetUid);
    });

    if (existing) {
      await existing.ref.update({ status: 'active' });
      return NextResponse.json({ roomId: existing.id, isNew: false });
    }

    const docRef = await adminDb.collection('chat_rooms').add({
      type: 'direct',
      members: [uid, targetUid],
      storeId: storeId || '',
      status: 'active',
      lastMessage: '',
      lastMessageAt: FieldValue.serverTimestamp(),
      unreadCount: { [uid]: 0, [targetUid]: 0 },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ roomId: docRef.id, isNew: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
