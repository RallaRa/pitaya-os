import { NextResponse } from 'next/server';
import {
  handleAccountingApiError,
  requireAccountingAccess,
} from '@/lib/accounting/requireAccountingAccess';
import type { AutoVoucherQueueStatus } from '@/lib/accounting/types';
import {
  approveAutoVoucher,
  getAutoVoucherById,
  listAutoVoucherQueue,
  rejectAutoVoucher,
  syncPurchasesToAutoVoucherQueue,
  syncSalesToAutoVoucherQueue,
} from '@/lib/accounting/autoVoucherQueue.server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const id = searchParams.get('id');
    const status = (searchParams.get('status') || 'pending') as AutoVoucherQueueStatus | 'all';
    const startDate = searchParams.get('startDate') || '';
    const endDate = searchParams.get('endDate') || '';

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await requireAccountingAccess(req, 'accountingVoucher', storeId);

    if (id) {
      const row = await getAutoVoucherById(storeId, id);
      if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
      return NextResponse.json({ autoVoucher: row });
    }

    const rows = await listAutoVoucherQueue(storeId, {
      status,
      startDate: startDate || undefined,
      endDate: endDate || undefined,
    });

    return NextResponse.json({ autoVouchers: rows });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const action = String(body.action || 'approve');

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const { uid } = await requireAccountingAccess(req, 'accountingVoucher', storeId);

    if (action === 'sync_purchases') {
      const result = await syncPurchasesToAutoVoucherQueue(storeId, uid);
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'sync_sales') {
      const result = await syncSalesToAutoVoucherQueue(storeId, uid, {
        startDate: body.startDate || undefined,
        endDate: body.endDate || undefined,
      });
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'sync_all') {
      const purchases = await syncPurchasesToAutoVoucherQueue(storeId, uid);
      const sales = await syncSalesToAutoVoucherQueue(storeId, uid, {
        startDate: body.startDate || undefined,
        endDate: body.endDate || undefined,
      });
      return NextResponse.json({
        success: true,
        purchases,
        sales,
        synced: purchases.synced + sales.synced,
        skipped: purchases.skipped + sales.skipped,
        errors: [...purchases.errors, ...sales.errors],
      });
    }

    const ids = Array.isArray(body.ids) ? body.ids as string[] : [];
    if (ids.length === 0) {
      return NextResponse.json({ error: 'ids required' }, { status: 400 });
    }

    const results = [];
    for (const id of ids) {
      if (action === 'reject') {
        results.push(await rejectAutoVoucher({
          storeId,
          uid,
          autoVoucherId: id,
          reason: String(body.reason || ''),
        }));
      } else {
        results.push(await approveAutoVoucher({ storeId, uid, autoVoucherId: id }));
      }
    }

    const success = results.filter(r => r.ok);
    const failed = results.filter(r => !r.ok);

    return NextResponse.json({
      success: true,
      action,
      processed: success.length,
      failed: failed.length,
      results,
    });
  } catch (e) {
    return handleAccountingApiError(e);
  }
}
