import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const page = searchParams.get('page') || 'register';
  if (!storeId) return NextResponse.json({ error: 'storeId 필수' }, { status: 400 });

  const docId = `${storeId}_${authUser.uid}_${page}`;
  const snap = await adminDb.collection('purchase_chat_logs').doc(docId).get();
  return NextResponse.json({ messages: snap.exists ? snap.data()?.messages || [] : [] });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { storeId, page, messages } = await req.json();
  if (!storeId || !page || !Array.isArray(messages)) {
    return NextResponse.json({ error: 'storeId, page, messages 필수' }, { status: 400 });
  }

  const docId = `${storeId}_${authUser.uid}_${page}`;
  await adminDb.collection('purchase_chat_logs').doc(docId).set({
    storeId, page, uid: authUser.uid,
    messages: messages.slice(-50),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return NextResponse.json({ ok: true });
}
