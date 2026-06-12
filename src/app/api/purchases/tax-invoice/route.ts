import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  batchReleasePurchasesToAutoVoucher,
  listPurchasesForTaxInvoiceProcessing,
  updatePurchaseTaxDocDraft,
  verifyAndReleasePurchaseToAutoVoucher,
} from '@/lib/purchase/taxInvoice.server';
import type { TaxDocType, TaxDocWorkflowStatus } from '@/lib/purchase/taxInvoiceWorkflow';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const status = (searchParams.get('status') || 'pending_review') as TaxDocWorkflowStatus | 'all';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const purchases = await listPurchasesForTaxInvoiceProcessing(storeId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
      status,
    });
    return NextResponse.json({ purchases });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const purchaseId = String(body.purchaseId || '');
    if (!storeId || !purchaseId) {
      return NextResponse.json({ error: 'storeId, purchaseId required' }, { status: 400 });
    }

    const purchase = await updatePurchaseTaxDocDraft({
      storeId,
      purchaseId,
      uid: authUser.uid,
      taxDocType: body.taxDocType as TaxDocType | undefined,
      taxDocNumber: body.taxDocNumber,
      physicalMatchOk: body.physicalMatchOk,
      physicalMatchNote: body.physicalMatchNote,
      taxDocWorkflowStatus: body.taxDocWorkflowStatus as TaxDocWorkflowStatus | undefined,
    });

    return NextResponse.json({ success: true, purchase });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '저장 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const action = String(body.action || 'release');

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    if (action === 'release_batch') {
      const purchaseIds = Array.isArray(body.purchaseIds) ? body.purchaseIds as string[] : [];
      if (!purchaseIds.length) {
        return NextResponse.json({ error: 'purchaseIds required' }, { status: 400 });
      }
      const results = await batchReleasePurchasesToAutoVoucher({
        storeId,
        purchaseIds,
        uid: authUser.uid,
        defaults: {
          taxDocType: body.taxDocType as TaxDocType | undefined,
          physicalMatchOk: body.physicalMatchOk === true,
        },
      });
      const ok = results.filter(r => r.ok);
      const failed = results.filter(r => !r.ok);
      return NextResponse.json({
        success: true,
        processed: ok.length,
        failed: failed.length,
        results,
      });
    }

    const purchaseId = String(body.purchaseId || '');
    if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });

    const result = await verifyAndReleasePurchaseToAutoVoucher({
      storeId,
      purchaseId,
      uid: authUser.uid,
      taxDocType: (body.taxDocType as TaxDocType) || 'tax_invoice',
      taxDocNumber: body.taxDocNumber,
      physicalMatchOk: body.physicalMatchOk === true,
      physicalMatchNote: body.physicalMatchNote,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error || '처리 실패' }, { status: 400 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
