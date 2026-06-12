import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const doc = await adminDb.collection('accounting_settings').doc(storeId).get();
    return NextResponse.json({
      settings: doc.exists ? doc.data() : {
        storeId,
        fiscalYearStart: 1,
        voucherApprovalRequired: true,
        autoVoucherFromPurchase: false,
        autoVoucherFromSales: false,
        autoVoucherFromExpense: false,
      },
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { storeId, ...patch } = body;
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    await adminDb.collection('accounting_settings').doc(storeId).set({
      storeId,
      ...patch,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
