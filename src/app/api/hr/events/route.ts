import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const month   = searchParams.get('month'); // YYYY-MM

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('hr_calendar_events');
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.limit(500).get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (month) {
      docs = docs.filter((d: any) => {
        return d.startDate?.startsWith(month) || d.endDate?.startsWith(month);
      });
    }

    return NextResponse.json({ events: docs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, title, startDate, endDate, type, description, createdBy } = body;

    if (!title || !startDate) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const ref = await adminDb.collection('hr_calendar_events').add({
      storeId:    storeId || '',
      title,
      startDate,
      endDate:    endDate || startDate,
      type:       type || 'task',   // task | holiday | notice
      description: description || '',
      createdBy:  createdBy || '',
      createdAt:  FieldValue.serverTimestamp(),
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
    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    await adminDb.collection('hr_calendar_events').doc(id).update({
      ...updates,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    await adminDb.collection('hr_calendar_events').doc(id).delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
