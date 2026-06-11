import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { DEFAULT_CHART_OF_ACCOUNTS } from '@/lib/accounting/defaultChartOfAccounts';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

function accountDocId(storeId: string, code: string) {
  return `${storeId}_${code}`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = body.storeId;
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const existing = await adminDb.collection('accounting_accounts')
      .where('storeId', '==', storeId)
      .limit(1)
      .get();

    if (!existing.empty) {
      return NextResponse.json({ success: true, skipped: true, message: '이미 계정과목이 등록되어 있습니다.' });
    }

    const batch = adminDb.batch();
    for (const ac of DEFAULT_CHART_OF_ACCOUNTS) {
      batch.set(
        adminDb.collection('accounting_accounts').doc(accountDocId(storeId, ac.code)),
        {
          storeId,
          code: ac.code,
          name: ac.name,
          type: ac.type,
          parentCode: ac.parentCode || '',
          externalCode: ac.code,
          allowEntry: ac.allowEntry !== false,
          perItemOffset: ac.perItemOffset || false,
          usePartner: ac.usePartner || false,
          isFundAccount: ['101', '102', '103'].includes(ac.code),
          isActive: true,
          memo: '',
          sortOrder: parseInt(ac.code, 10) || 0,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      );
    }

    batch.set(adminDb.collection('accounting_settings').doc(storeId), {
      storeId,
      fiscalYearStart: 1,
      voucherApprovalRequired: true,
      autoVoucherFromPurchase: false,
      autoVoucherFromSales: false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    await batch.commit();
    return NextResponse.json({ success: true, count: DEFAULT_CHART_OF_ACCOUNTS.length });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
