import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import {
  listSalesForVoucherIntegration,
  loadSalesVoucherPattern,
  processSalesToVoucher,
} from '@/lib/accounting/salesVoucher.server';
import { DEFAULT_SALES_VOUCHER_PATTERN } from '@/lib/accounting/salesVoucherPattern';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';
    const linked = (searchParams.get('linked') || 'pending') as 'all' | 'pending' | 'done';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    const [sales, pattern] = await Promise.all([
      listSalesForVoucherIntegration(storeId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        linked,
      }),
      loadSalesVoucherPattern(storeId),
    ]);

    return NextResponse.json({ sales, pattern: pattern || DEFAULT_SALES_VOUCHER_PATTERN });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const salesIds = Array.isArray(body.salesIds) ? body.salesIds as string[] : [];
    const savePattern = !!body.savePattern;

    if (!storeId || salesIds.length === 0) {
      return NextResponse.json({ error: 'storeId and salesIds required' }, { status: 400 });
    }

    const { uid } = await requireAccountingAccess(req, 'accountingVoucher', storeId);
    const pattern = body.pattern || await loadSalesVoucherPattern(storeId);

    if (savePattern && body.pattern) {
      await adminDb.collection('accounting_settings').doc(storeId).set({
        storeId,
        salesVoucherPattern: pattern,
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }

    const results = [];
    for (const salesId of salesIds) {
      results.push(await processSalesToVoucher({ storeId, uid, salesId, pattern }));
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
