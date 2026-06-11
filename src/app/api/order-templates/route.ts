import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

function col(storeId: string) {
  return adminDb.collection('order_templates').where('storeId', '==', storeId);
}

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const snap = await col(storeId).get();
  const templates = snap.docs
    .map(d => ({ id: d.id, ...d.data() } as Record<string, unknown> & { id: string; name?: string }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));
  return NextResponse.json({ templates });
}

export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const storeId = String(body.storeId || '');
  const name = String(body.name || '').trim();
  if (!storeId || !name) return NextResponse.json({ error: 'storeId and name required' }, { status: 400 });

  const now = FieldValue.serverTimestamp();
  const payload = {
    storeId,
    name,
    supplierId: String(body.supplierId || ''),
    supplierName: String(body.supplierName || ''),
    lines: Array.isArray(body.lines) ? body.lines : [],
    schedule: body.schedule || null,
    active: body.active !== false,
    createdBy: user.uid,
    updatedAt: now,
    createdAt: now,
  };

  const ref = await adminDb.collection('order_templates').add(payload);
  return NextResponse.json({ success: true, id: ref.id });
}

export async function PUT(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const id = String(body.id || '');
  const storeId = String(body.storeId || '');
  if (!id || !storeId) return NextResponse.json({ error: 'id and storeId required' }, { status: 400 });

  const ref = adminDb.collection('order_templates').doc(id);
  const existing = await ref.get();
  if (!existing.exists) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (String(existing.data()?.storeId || '') !== storeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id: _id, storeId: _storeId, ...updates } = body;
  await ref.update({
    ...updates,
    storeId,
    updatedAt: FieldValue.serverTimestamp(),
  });
  return NextResponse.json({ success: true });
}

export async function DELETE(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  const storeId = searchParams.get('storeId') || '';
  if (!id || !storeId) return NextResponse.json({ error: 'id and storeId required' }, { status: 400 });

  const ref = adminDb.collection('order_templates').doc(id);
  const existing = await ref.get();
  if (!existing.exists) return NextResponse.json({ error: 'not found' }, { status: 404 });
  if (String(existing.data()?.storeId || '') !== storeId) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  await ref.delete();
  return NextResponse.json({ success: true });
}
