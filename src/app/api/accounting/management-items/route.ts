import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

export type ManagementItemType = 'dept' | 'project';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const type = searchParams.get('type') || '';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    let q = adminDb.collection('accounting_management_items').where('storeId', '==', storeId);
    if (type) q = q.where('type', '==', type) as typeof q;

    const snap = await q.limit(200).get();
    const items = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as { id: string; name?: string }))
      .sort((a, b) => String(a.name || '').localeCompare(String(b.name || '')));

    return NextResponse.json({ items });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const type = String(body.type || '') as ManagementItemType;
    const code = String(body.code || '').trim();
    const name = String(body.name || '').trim();

    if (!storeId || !type || !code || !name) {
      return NextResponse.json({ error: 'storeId, type, code, name required' }, { status: 400 });
    }
    if (type !== 'dept' && type !== 'project') {
      return NextResponse.json({ error: 'type must be dept or project' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const id = `${storeId}_${type}_${code}`;
    await adminDb.collection('accounting_management_items').doc(id).set({
      storeId,
      type,
      code,
      name,
      memo: String(body.memo || ''),
      isActive: body.isActive !== false,
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true, id });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const id = searchParams.get('id');

    if (!storeId || !id) return NextResponse.json({ error: 'storeId, id required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const ref = adminDb.collection('accounting_management_items').doc(id);
    const snap = await ref.get();
    if (!snap.exists || snap.data()?.storeId !== storeId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    await ref.delete();

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
