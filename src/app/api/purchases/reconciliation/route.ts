import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import type { PurchaseEvidenceSource } from '@/lib/purchase/purchaseEvidence';
import {
  batchConfirmReconciliation,
  confirmReconciliation,
  getReconciliationView,
  importPurchaseEvidence,
  listPurchaseEvidence,
  manualLinkEvidence,
} from '@/lib/purchase/purchaseReconciliation.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId');
  const startDate = searchParams.get('startDate') || '';
  const endDate = searchParams.get('endDate') || '';
  const mode = searchParams.get('mode') || 'reconcile';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    if (mode === 'evidence') {
      const sourceType = (searchParams.get('sourceType') || 'all') as PurchaseEvidenceSource | 'all';
      const evidence = await listPurchaseEvidence(storeId, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        sourceType,
      });
      return NextResponse.json({ evidence });
    }

    const view = await getReconciliationView(storeId, {
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });
    return NextResponse.json(view);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const action = String(body.action || 'import');

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    if (action === 'import') {
      const sourceType = body.sourceType as PurchaseEvidenceSource;
      const records = Array.isArray(body.records) ? body.records : [];
      if (!sourceType || !records.length) {
        return NextResponse.json({ error: 'sourceType, records required' }, { status: 400 });
      }
      const result = await importPurchaseEvidence({
        storeId,
        uid: authUser.uid,
        sourceType,
        records,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'confirm') {
      const purchaseId = String(body.purchaseId || '');
      if (!purchaseId) return NextResponse.json({ error: 'purchaseId required' }, { status: 400 });
      const result = await confirmReconciliation({
        storeId,
        purchaseId,
        uid: authUser.uid,
        releaseToAutoVoucher: body.releaseToAutoVoucher === true,
        note: body.note,
      });
      return NextResponse.json({ success: true, result });
    }

    if (action === 'confirm_batch') {
      const purchaseIds = Array.isArray(body.purchaseIds) ? body.purchaseIds as string[] : [];
      if (!purchaseIds.length) {
        return NextResponse.json({ error: 'purchaseIds required' }, { status: 400 });
      }
      const results = await batchConfirmReconciliation({
        storeId,
        purchaseIds,
        uid: authUser.uid,
        releaseToAutoVoucher: body.releaseToAutoVoucher === true,
      });
      const ok = results.filter(r => r.ok).length;
      return NextResponse.json({ success: true, processed: ok, failed: results.length - ok, results });
    }

    if (action === 'link') {
      const purchaseId = String(body.purchaseId || '');
      const evidenceId = String(body.evidenceId || '');
      if (!purchaseId || !evidenceId) {
        return NextResponse.json({ error: 'purchaseId, evidenceId required' }, { status: 400 });
      }
      await manualLinkEvidence({
        storeId,
        purchaseId,
        evidenceId,
        uid: authUser.uid,
      });
      return NextResponse.json({ success: true });
    }

    return NextResponse.json({ error: 'unknown action' }, { status: 400 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
