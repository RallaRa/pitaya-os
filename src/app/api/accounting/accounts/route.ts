import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import type { AccountType } from '@/lib/accounting/types';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

function accountDocId(storeId: string, code: string) {
  return `${storeId}_${code}`;
}

function buildAccountPayload(body: Record<string, unknown>, storeId: string, merge = false) {
  const code = String(body.code || '').trim();
  const payload: Record<string, unknown> = {
    storeId,
    code,
    name: String(body.name || '').trim(),
    type: body.type as AccountType,
    parentCode: String(body.parentCode || '').trim(),
    externalCode: String(body.externalCode || code).trim(),
    allowEntry: body.allowEntry !== false,
    perItemOffset: !!body.perItemOffset,
    usePartner: !!body.usePartner,
    isFundAccount: !!body.isFundAccount,
    isActive: body.isActive !== false,
    memo: String(body.memo || '').trim(),
    sortOrder: parseInt(code, 10) || 0,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (!merge) payload.createdAt = FieldValue.serverTimestamp();
  return payload;
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const snap = await adminDb.collection('accounting_accounts')
      .where('storeId', '==', storeId)
      .get();

    const accounts = snap.docs
      .map(d => ({ id: d.id, ...d.data() }))
      .sort((a, b) => String(a.code).localeCompare(String(b.code)));
    return NextResponse.json({ accounts });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { storeId, code, name, type } = body;
    if (!storeId || !code || !name || !type) {
      return NextResponse.json({ error: 'storeId, code, name, type 필수' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const trimmedCode = String(code).trim();
    const docId = accountDocId(storeId, trimmedCode);
    const existing = await adminDb.collection('accounting_accounts').doc(docId).get();
    if (existing.exists) {
      return NextResponse.json({ error: '이미 사용 중인 계정코드입니다.' }, { status: 409 });
    }

    await adminDb.collection('accounting_accounts').doc(docId).set(
      buildAccountPayload(body, storeId),
    );

    return NextResponse.json({ success: true, id: docId });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { storeId, id, code } = body;
    if (!storeId || !id) {
      return NextResponse.json({ error: 'storeId, id 필수' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const ref = adminDb.collection('accounting_accounts').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (snap.data()?.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const newCode = String(code ?? snap.data()?.code).trim();
    const oldCode = String(snap.data()?.code);

    if (newCode !== oldCode) {
      return NextResponse.json({ error: '계정코드는 변경할 수 없습니다. 신규 등록 후 기존 계정을 미사용 처리하세요.' }, { status: 400 });
    }

    await ref.set(buildAccountPayload({ ...snap.data(), ...body, code: newCode }, storeId, true), { merge: true });
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
    if (!storeId || !id) {
      return NextResponse.json({ error: 'storeId, id required' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const ref = adminDb.collection('accounting_accounts').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (snap.data()?.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const used = await adminDb.collection('accounting_vouchers')
      .where('storeId', '==', storeId)
      .limit(1)
      .get();

    if (!used.empty) {
      await ref.update({
        isActive: false,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, softDeleted: true });
    }

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
