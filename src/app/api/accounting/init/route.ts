import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  defaultAccountToFirestore,
  isFundAccountCode,
} from '@/lib/accounting/defaultChartOfAccounts';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';

const BATCH_LIMIT = 400;

function accountDocId(storeId: string, code: string) {
  return `${storeId}_${code}`;
}

async function deleteAllStoreAccounts(storeId: string): Promise<number> {
  const snap = await adminDb.collection('accounting_accounts')
    .where('storeId', '==', storeId)
    .get();

  if (snap.empty) return 0;

  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    snap.docs.slice(i, i + BATCH_LIMIT).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  return snap.size;
}

async function seedDefaultAccounts(storeId: string): Promise<number> {
  for (let i = 0; i < DEFAULT_CHART_OF_ACCOUNTS.length; i += BATCH_LIMIT) {
    const batch = adminDb.batch();
    const chunk = DEFAULT_CHART_OF_ACCOUNTS.slice(i, i + BATCH_LIMIT);

    for (const ac of chunk) {
      const payload = defaultAccountToFirestore(ac, storeId);
      batch.set(
        adminDb.collection('accounting_accounts').doc(accountDocId(storeId, ac.code)),
        {
          ...payload,
          isFundAccount: isFundAccountCode(ac.code),
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
      );
    }

    await batch.commit();
  }

  return DEFAULT_CHART_OF_ACCOUNTS.length;
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = body.storeId;
    const merge = body.merge === true;
    const replace = body.replace === true;
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    const existingSnap = await adminDb.collection('accounting_accounts')
      .where('storeId', '==', storeId)
      .get();

    const existingCodes = new Set(
      existingSnap.docs.map(d => String(d.data().code || '')),
    );

    if (replace) {
      const deleted = await deleteAllStoreAccounts(storeId);
      const count = await seedDefaultAccounts(storeId);

      if (existingSnap.empty) {
        await adminDb.collection('accounting_settings').doc(storeId).set({
          storeId,
          fiscalYearStart: 1,
          voucherApprovalRequired: true,
          autoVoucherFromPurchase: false,
          autoVoucherFromSales: false,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        }, { merge: true });
      }

      return NextResponse.json({
        success: true,
        replaced: true,
        deleted,
        count,
        total: count,
      });
    }

    if (!existingSnap.empty && !merge) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: '이미 계정과목이 등록되어 있습니다. 누락 항목 추가는 merge, 전체 교체는 replace: true를 사용하세요.',
      });
    }

    const toAdd = DEFAULT_CHART_OF_ACCOUNTS.filter(ac => !existingCodes.has(ac.code));
    if (toAdd.length === 0) {
      return NextResponse.json({
        success: true,
        skipped: true,
        message: '표준 계정과목이 모두 등록되어 있습니다.',
        total: existingCodes.size,
      });
    }

    for (let i = 0; i < toAdd.length; i += BATCH_LIMIT) {
      const batch = adminDb.batch();
      const chunk = toAdd.slice(i, i + BATCH_LIMIT);

      for (const ac of chunk) {
        const payload = defaultAccountToFirestore(ac, storeId);
        batch.set(
          adminDb.collection('accounting_accounts').doc(accountDocId(storeId, ac.code)),
          {
            ...payload,
            isFundAccount: isFundAccountCode(ac.code),
            createdAt: FieldValue.serverTimestamp(),
            updatedAt: FieldValue.serverTimestamp(),
          },
        );
      }

      await batch.commit();
    }

    if (existingSnap.empty) {
      await adminDb.collection('accounting_settings').doc(storeId).set({
        storeId,
        fiscalYearStart: 1,
        voucherApprovalRequired: true,
        autoVoucherFromPurchase: false,
        autoVoucherFromSales: false,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    return NextResponse.json({
      success: true,
      count: toAdd.length,
      total: existingCodes.size + toAdd.length,
      merged: merge && !existingSnap.empty,
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
