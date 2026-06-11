import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import type { VoucherLine, VoucherType } from '@/lib/accounting/types';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

async function nextVoucherNo(storeId: string, date: string): Promise<string> {
  const prefix = date.replace(/-/g, '');
  const snap = await adminDb.collection('accounting_vouchers')
    .where('storeId', '==', storeId)
    .where('voucherDate', '==', date)
    .get();

  let max = 0;
  for (const d of snap.docs) {
    const no = String(d.data().voucherNo || '');
    const seq = parseInt(no.split('-').pop() || '0', 10);
    if (seq > max) max = seq;
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

function sumLines(lines: VoucherLine[]) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  }
  return { totalDebit, totalCredit };
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    let q = adminDb.collection('accounting_vouchers').where('storeId', '==', storeId);
    if (status) q = q.where('status', '==', status) as typeof q;

    const snap = await q.limit(200).get();
    let vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    vouchers.sort((a, b) => String(b.voucherDate).localeCompare(String(a.voucherDate)));

    if (startDate) vouchers = vouchers.filter(v => String(v.voucherDate) >= startDate);
    if (endDate) vouchers = vouchers.filter(v => String(v.voucherDate) <= endDate);

    return NextResponse.json({ vouchers });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      storeId,
      voucherDate,
      voucherType = 'general',
      description,
      lines,
      status = 'draft',
    } = body as {
      storeId: string;
      voucherDate?: string;
      voucherType?: VoucherType;
      description?: string;
      lines: VoucherLine[];
      status?: string;
    };

    if (!storeId || !Array.isArray(lines) || lines.length < 2) {
      return NextResponse.json({ error: 'storeId, lines(2행 이상) 필수' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const { totalDebit, totalCredit } = sumLines(lines);
    if (totalDebit !== totalCredit || totalDebit <= 0) {
      return NextResponse.json({ error: '차변·대변 합계가 일치해야 합니다.' }, { status: 400 });
    }

    const date = voucherDate || getKSTTodayYMD();
    const voucherNo = await nextVoucherNo(storeId, date);

    const ref = await adminDb.collection('accounting_vouchers').add({
      storeId,
      voucherNo,
      voucherDate: date,
      voucherType,
      status,
      description: description || '',
      lines,
      totalDebit,
      totalCredit,
      sourceType: 'manual',
      createdBy: uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id, voucherNo });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, storeId, action } = body;
    if (!id || !storeId || !action) {
      return NextResponse.json({ error: 'id, storeId, action 필수' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const ref = adminDb.collection('accounting_vouchers').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (snap.data()?.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    if (action === 'approve') {
      await ref.update({
        status: 'approved',
        approvedBy: uid,
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'cancel') {
      await ref.update({
        status: 'cancelled',
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
