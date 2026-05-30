import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { dayOfWeekFromYMD, serializeTimestamp, type RequestAttachment } from '@/lib/customerRequestLog';

function mapDoc(id: string, data: Record<string, unknown>) {
  return {
    id,
    storeId: data.storeId,
    cusCode: data.cusCode,
    requestDate: data.requestDate || '',
    requestTime: data.requestTime || '',
    dayOfWeek: data.dayOfWeek || '',
    content: data.content || '',
    attachments: (data.attachments || []) as RequestAttachment[],
    createdAt: serializeTimestamp(data.createdAt),
    updatedAt: serializeTimestamp(data.updatedAt),
    createdByEmail: data.createdByEmail || '',
    updatedByEmail: data.updatedByEmail || '',
  };
}

async function getUserEmail(uid: string): Promise<string> {
  const snap = await adminDb.collection('users').doc(uid).get();
  return snap.exists ? String(snap.data()?.email || '') : '';
}

// GET /api/customers/requests?storeId=&cusCode=
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const cusCode = searchParams.get('cusCode') || '';
  if (!storeId || !cusCode) {
    return NextResponse.json({ error: 'storeId and cusCode required' }, { status: 400 });
  }

  try {
    const snap = await adminDb.collection('customer_request_logs')
      .where('storeId', '==', storeId)
      .where('cusCode', '==', cusCode)
      .orderBy('updatedAt', 'desc')
      .get();

    return NextResponse.json({ requests: snap.docs.map(d => mapDoc(d.id, d.data())) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST — 새 요청 이력
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const storeId = String(body.storeId || '');
  const cusCode = String(body.cusCode || '');
  const requestDate = String(body.requestDate || '');
  const requestTime = String(body.requestTime || '');
  const dayOfWeek = String(body.dayOfWeek || dayOfWeekFromYMD(requestDate));
  const content = String(body.content || '').trim();
  const attachments = Array.isArray(body.attachments) ? body.attachments : [];

  if (!storeId || !cusCode || !requestDate) {
    return NextResponse.json({ error: 'storeId, cusCode, requestDate required' }, { status: 400 });
  }
  if (!content && attachments.length === 0) {
    return NextResponse.json({ error: '내용 또는 첨부파일을 입력하세요' }, { status: 400 });
  }

  const email = await getUserEmail(user.uid);

  try {
    const ref = await adminDb.collection('customer_request_logs').add({
      storeId,
      cusCode,
      requestDate,
      requestTime,
      dayOfWeek,
      content,
      attachments,
      createdBy: user.uid,
      createdByEmail: email,
      updatedBy: user.uid,
      updatedByEmail: email,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    const saved = await ref.get();
    return NextResponse.json({ request: mapDoc(ref.id, saved.data()!) });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PATCH — 수정
export async function PATCH(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }

  const id = String(body.id || '');
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ref = adminDb.collection('customer_request_logs').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requestDate = String(body.requestDate ?? snap.data()?.requestDate ?? '');
  const email = await getUserEmail(user.uid);

  const update: Record<string, unknown> = {
    requestDate,
    requestTime: String(body.requestTime ?? snap.data()?.requestTime ?? ''),
    dayOfWeek: String(body.dayOfWeek ?? dayOfWeekFromYMD(requestDate)),
    content: String(body.content ?? snap.data()?.content ?? '').trim(),
    attachments: Array.isArray(body.attachments) ? body.attachments : snap.data()?.attachments || [],
    updatedBy: user.uid,
    updatedByEmail: email,
    updatedAt: FieldValue.serverTimestamp(),
  };

  if (!update.content && (update.attachments as unknown[]).length === 0) {
    return NextResponse.json({ error: '내용 또는 첨부파일을 입력하세요' }, { status: 400 });
  }

  await ref.update(update);
  const saved = await ref.get();
  return NextResponse.json({ request: mapDoc(id, saved.data()!) });
}

// DELETE /api/customers/requests?id=
export async function DELETE(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  const ref = adminDb.collection('customer_request_logs').doc(id);
  const snap = await ref.get();
  if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  await ref.delete();
  return NextResponse.json({ success: true });
}
