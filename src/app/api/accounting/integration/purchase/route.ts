import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import {
  listPurchasesForVoucherIntegration,
  loadPurchaseVoucherPattern,
  processPurchaseToVoucher,
} from '@/lib/accounting/purchaseVoucher.server';
import { DEFAULT_PURCHASE_VOUCHER_PATTERN } from '@/lib/accounting/purchaseVoucherPattern';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const linked = (searchParams.get('linked') || 'pending') as 'all' | 'pending' | 'done';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const [purchases, pattern] = await Promise.all([
      listPurchasesForVoucherIntegration(storeId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        linked,
      }),
      loadPurchaseVoucherPattern(storeId),
    ]);

    return NextResponse.json({ purchases, pattern: pattern || DEFAULT_PURCHASE_VOUCHER_PATTERN });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const purchaseIds = Array.isArray(body.purchaseIds) ? body.purchaseIds as string[] : [];
    const savePattern = !!body.savePattern;
    const autoApprove = !!body.autoApprove;

    if (!storeId || purchaseIds.length === 0) {
      return NextResponse.json({ error: 'storeId and purchaseIds required' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const pattern = body.pattern || await loadPurchaseVoucherPattern(storeId);

    if (savePattern && body.pattern) {
      await adminDb.collection('accounting_settings').doc(storeId).set({
        storeId,
        purchaseVoucherPattern: pattern,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const results = [];
    for (const purchaseId of purchaseIds) {
      const result = await processPurchaseToVoucher({
        storeId,
        uid,
        purchaseId,
        pattern,
        autoApprove,
      });
      results.push(result);
    }

    const success = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    return NextResponse.json({
      success: true,
      processed: success.length,
      failed: failed.length,
      results,
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    if (!storeId || !body.pattern) {
      return NextResponse.json({ error: 'storeId and pattern required' }, { status: 400 });
    }

    await requireAccountingAccess(req, 'accountingMaster', storeId);

    await adminDb.collection('accounting_settings').doc(storeId).set({
      storeId,
      purchaseVoucherPattern: body.pattern,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
