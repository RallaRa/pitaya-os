import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

const EVENT_FIELDS = [
  'storeId', 'title', 'startDate', 'startTime', 'endDate', 'endTime',
  'allDay', 'calendarId', 'color', 'location', 'meetingUrl', 'description',
  'attendees', 'repeat', 'reminders', 'visibility', 'status', 'type', 'createdBy',
] as const;

function pickEventFields(body: Record<string, unknown>, includeStore = false) {
  const out: Record<string, unknown> = {};
  for (const key of EVENT_FIELDS) {
    if (body[key] !== undefined) out[key] = body[key];
  }
  if (body.busyStatus !== undefined && out.status === undefined) {
    out.status = body.busyStatus;
  }
  if (includeStore && body.storeId !== undefined) out.storeId = body.storeId;
  return out;
}

async function fetchEvents(storeId: string) {
  let q: FirebaseFirestore.Query = adminDb.collection('calendar_events');
  if (storeId) q = q.where('storeId', '==', storeId);

  try {
    const snap = await q.orderBy('startDate').limit(1000).get();
    return snap.docs.map(d => ({ id: d.id, ...d.data() }));
  } catch {
    const snap = await q.limit(1000).get();
    return snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a: any, b: any) => String(a.startDate || '').localeCompare(String(b.startDate || '')));
  }
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId  = searchParams.get('storeId') || '';
  const from     = searchParams.get('from') || '';
  const to       = searchParams.get('to') || '';

  try {
    let docs = await fetchEvents(storeId) as any[];

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
    const picked = pickEventFields(body, true);
    const { title, startDate } = picked;

    if (!title || !startDate) {
      return NextResponse.json({ error: '제목과 날짜는 필수입니다' }, { status: 400 });
    }

    const ref = await adminDb.collection('calendar_events').add({
      storeId:    (picked.storeId as string) || '',
      title,
      startDate,
      startTime:  picked.startTime  || null,
      endDate:    picked.endDate    || startDate,
      endTime:    picked.endTime    || null,
      allDay:     picked.allDay     ?? true,
      calendarId: picked.calendarId || 'default',
      color:      picked.color      || null,
      location:   picked.location   || null,
      meetingUrl: picked.meetingUrl || null,
      description: picked.description || null,
      attendees:  picked.attendees  || [],
      repeat:     picked.repeat     || null,
      reminders:  picked.reminders  || [],
      visibility: picked.visibility || 'public',
      status:     picked.status     || 'busy',
      type:       picked.type       || 'event',
      createdBy:  picked.createdBy  || '',
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
    const { id } = body;
    if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

    const updates = pickEventFields(body, true);
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
