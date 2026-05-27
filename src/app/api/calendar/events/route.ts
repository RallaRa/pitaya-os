import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId  = searchParams.get('storeId') || '';
  const uid      = searchParams.get('uid') || '';
  const from     = searchParams.get('from') || '';
  const to       = searchParams.get('to') || '';

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('calendar_events');
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.orderBy('startDate').limit(1000).get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];

    if (from) docs = docs.filter((d: any) => d.endDate >= from);
    if (to)   docs = docs.filter((d: any) => d.startDate <= to);

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
    const {
      storeId, title, startDate, startTime, endDate, endTime,
      allDay, calendarId, color, location, meetingUrl, description,
      attendees, repeat, reminders, visibility, status,
      createdBy, type,
    } = body;

    if (!title || !startDate) {
      return NextResponse.json({ error: '제목과 날짜는 필수입니다' }, { status: 400 });
    }

    const ref = await adminDb.collection('calendar_events').add({
      storeId:    storeId || '',
      title,
      startDate,
      startTime:  startTime  || null,
      endDate:    endDate    || startDate,
      endTime:    endTime    || null,
      allDay:     allDay     ?? true,
      calendarId: calendarId || 'default',
      color:      color      || null,
      location:   location   || null,
      meetingUrl: meetingUrl || null,
      description: description || null,
      attendees:  attendees  || [],
      repeat:     repeat     || null,
      reminders:  reminders  || [],
      visibility: visibility || 'public',
      status:     status     || 'busy',
      type:       type       || 'event',
      createdBy:  createdBy  || '',
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

    updates.updatedAt = FieldValue.serverTimestamp();
    await adminDb.collection('calendar_events').doc(id).update(updates);
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
    await adminDb.collection('calendar_events').doc(id).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
