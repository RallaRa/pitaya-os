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
    const storeId = searchParams.get('storeId');
    const conversationId = searchParams.get('id');

    if (conversationId) {
      const snap = await adminDb.collection('ai_conversations').doc(conversationId).get();
      if (!snap.exists) {
        return NextResponse.json({ error: '대화를 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ conversation: { id: snap.id, ...snap.data() } });
    }

    if (!uid) {
      return NextResponse.json({ error: 'uid 없음' }, { status: 400 });
    }

    const snap = await adminDb
      .collection('ai_conversations')
      .where('uid', '==', uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    let conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    // storeId 필터: 복합 인덱스 없이 메모리에서 처리
    if (storeId) {
      conversations = conversations.filter((c: any) => c.storeId === storeId);
    }
    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: conversationId 있으면 업데이트, 없으면 신규 생성
export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { conversationId, uid, storeId, title, messages } = await req.json();

    if (conversationId) {
      const update: Record<string, any> = {
        messages: messages || [],
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (title !== undefined) update.title = title;
      await adminDb.collection('ai_conversations').doc(conversationId).update(update);
      return NextResponse.json({ success: true, id: conversationId });
    }

    if (!uid) {
      return NextResponse.json({ error: 'uid 없음' }, { status: 400 });
    }
    const docRef = await adminDb.collection('ai_conversations').add({
      uid,
      storeId: storeId || '',
      title: title || '새 대화',
      messages: messages || [],
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return NextResponse.json({ success: true, id: docRef.id });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    if (!id) {
      return NextResponse.json({ error: 'id 없음' }, { status: 400 });
    }
    await adminDb.collection('ai_conversations').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
