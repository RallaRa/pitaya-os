import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const uid     = searchParams.get('uid') || '';
  const listId  = searchParams.get('listId') || '';

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('calendar_todos');
    if (storeId) q = q.where('storeId', '==', storeId);
    if (uid)     q = q.where('createdBy', '==', uid);
    if (listId)  q = q.where('listId', '==', listId);

    const snap = await q.orderBy('order').limit(500).get();
    const todos = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    return NextResponse.json({ todos });
  } catch (e: any) {
    // order 인덱스 없을 때 fallback
    try {
      let q2: FirebaseFirestore.Query = adminDb.collection('calendar_todos');
      if (storeId) q2 = q2.where('storeId', '==', storeId);
      if (uid)     q2 = q2.where('createdBy', '==', uid);
      const snap2 = await q2.limit(500).get();
      const todos = snap2.docs.map(d => ({ id: d.id, ...d.data() }));
      return NextResponse.json({ todos });
    } catch (e2: any) {
      return NextResponse.json({ error: e2.message }, { status: 500 });
    }
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, title, dueDate, dueTime, hasTime, repeat, listId,
            priority, subTasks, description, assignedTo, createdBy, order } = body;

    if (!title) return NextResponse.json({ error: '제목 필수' }, { status: 400 });

    const ref = await adminDb.collection('calendar_todos').add({
      storeId:    storeId    || '',
      title,
      completed:  false,
      completedAt: null,
      dueDate:    dueDate    || null,
      dueTime:    dueTime    || null,
      hasTime:    hasTime    ?? false,
      repeat:     repeat     || null,
      listId:     listId     || 'default',
      priority:   priority   || 'medium',
      subTasks:   subTasks   || [],
      description: description || '',
      assignedTo: assignedTo || null,
      createdBy:  createdBy  || '',
      order:      order      ?? Date.now(),
      createdAt:  FieldValue.serverTimestamp(),
      updatedAt:  FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, ...updates } = body;
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    if (updates.completed === true && !updates.completedAt) {
      updates.completedAt = FieldValue.serverTimestamp();
    }
    updates.updatedAt = FieldValue.serverTimestamp();
    await adminDb.collection('calendar_todos').doc(id).update(updates);
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  try {
    await adminDb.collection('calendar_todos').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
