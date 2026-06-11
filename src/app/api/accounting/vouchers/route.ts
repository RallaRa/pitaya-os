import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import type { VoucherLine, VoucherType } from '@/lib/accounting/types';
import {
  getVoucherById,
  isAccountingPeriodClosed,
  nextVoucherNo,
  normalizeVoucherLines,
  sumVoucherLines,
} from '@/lib/accounting/voucher.server';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const id = searchParams.get('id');
    const status = searchParams.get('status');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const voucherType = searchParams.get('voucherType');

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    if (id) {
      const voucher = await getVoucherById(storeId, id);
      if (!voucher) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ voucher });
    }

    let q = adminDb.collection('accounting_vouchers').where('storeId', '==', storeId);
    if (status && status !== 'all') q = q.where('status', '==', status) as typeof q;
    if (voucherType) q = q.where('voucherType', '==', voucherType) as typeof q;

    const snap = await q.limit(200).get();
    let vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() } as { id: string; voucherDate?: string }));
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

    const normalized = normalizeVoucherLines(lines);
    const { totalDebit, totalCredit } = sumVoucherLines(normalized);
    if (totalDebit !== totalCredit || totalDebit <= 0) {
      return NextResponse.json({ error: '차변·대변 합계가 일치해야 합니다.' }, { status: 400 });
    }

    const date = voucherDate || getKSTTodayYMD();
    if (await isAccountingPeriodClosed(storeId, date)) {
      return NextResponse.json({ error: '마감된 기간에는 전표를 입력할 수 없습니다.' }, { status: 400 });
    }

    const settingsSnap = await adminDb.collection('accounting_settings').doc(storeId).get();
    const approvalRequired = settingsSnap.data()?.voucherApprovalRequired !== false;
    let finalStatus = status;
    if (status === 'submit') finalStatus = approvalRequired ? 'pending' : 'approved';

    const voucherNo = await nextVoucherNo(storeId, date);

    const ref = await adminDb.collection('accounting_vouchers').add({
      storeId,
      voucherNo,
      voucherDate: date,
      voucherType,
      status: finalStatus,
      description: description || '',
      lines: normalized,
      totalDebit,
      totalCredit,
      sourceType: 'manual',
      createdBy: uid,
      ...(finalStatus === 'approved' ? { approvedBy: uid, approvedAt: FieldValue.serverTimestamp() } : {}),
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id, voucherNo, status: finalStatus });
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
    const current = snap.data()!;
    if (current.storeId !== storeId) {
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
    } else if (action === 'submit') {
      if (current.status !== 'draft') {
        return NextResponse.json({ error: '작성중 전표만 제출할 수 있습니다.' }, { status: 400 });
      }
      const settingsSnap = await adminDb.collection('accounting_settings').doc(storeId).get();
      const approvalRequired = settingsSnap.data()?.voucherApprovalRequired !== false;
      const nextStatus = approvalRequired ? 'pending' : 'approved';
      await ref.update({
        status: nextStatus,
        ...(nextStatus === 'approved'
          ? { approvedBy: uid, approvedAt: FieldValue.serverTimestamp() }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
    } else if (action === 'update') {
      if (current.status !== 'draft') {
        return NextResponse.json({ error: '작성중 전표만 수정할 수 있습니다.' }, { status: 400 });
      }
      const lines = normalizeVoucherLines(body.lines || []);
      if (lines.length < 2) {
        return NextResponse.json({ error: 'lines(2행 이상) 필수' }, { status: 400 });
      }
      const { totalDebit, totalCredit } = sumVoucherLines(lines);
      if (totalDebit !== totalCredit || totalDebit <= 0) {
        return NextResponse.json({ error: '차변·대변 합계가 일치해야 합니다.' }, { status: 400 });
      }
      const date = String(body.voucherDate || current.voucherDate);
      if (await isAccountingPeriodClosed(storeId, date)) {
        return NextResponse.json({ error: '마감된 기간에는 전표를 수정할 수 없습니다.' }, { status: 400 });
      }
      await ref.update({
        voucherDate: date,
        voucherType: body.voucherType || current.voucherType,
        description: body.description ?? current.description ?? '',
        lines,
        totalDebit,
        totalCredit,
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
