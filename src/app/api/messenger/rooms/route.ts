import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

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

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, roomId } = body;
    if (!roomId) return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });

    const roomRef = adminDb.collection('chat_rooms').doc(roomId);

    // ── leave: uid를 멤버에서 제거, 멤버 0명이면 archived ──
    if (action === 'leave') {
      const { uid } = body;
      if (!uid) return NextResponse.json({ error: 'uid 없음' }, { status: 400 });

      const roomDoc = await roomRef.get();
      const members: string[] = roomDoc.data()?.members || [];
      const newMembers = members.filter(m => m !== uid);

      await roomRef.update({
        members: newMembers,
        status: newMembers.length === 0 ? 'archived' : 'active',
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    // ── delete: 슈퍼유저 전용 - 즉시 archived ──
    if (action === 'delete') {
      await roomRef.update({
        status: 'archived',
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: '알 수 없는 action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
