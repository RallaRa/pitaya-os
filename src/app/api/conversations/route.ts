import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
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

    const snap = await adminDb.collection('ai_conversations')
      .where('uid', '==', uid)
      .orderBy('updatedAt', 'desc')
      .limit(50)
      .get();

    const conversations = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ conversations });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid, title, messages } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: 'uid 없음' }, { status: 400 });
    }

    const docRef = await adminDb.collection('ai_conversations').add({
      uid,
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

export async function PUT(req: Request) {
  try {
    const { id, messages, title } = await req.json();
    if (!id) {
      return NextResponse.json({ error: 'id 없음' }, { status: 400 });
    }

    await adminDb.collection('ai_conversations').doc(id).update({
      messages,
      ...(title && { title }),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
