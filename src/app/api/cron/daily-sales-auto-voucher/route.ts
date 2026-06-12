import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { loadAccountingSettings } from '@/lib/accounting/accountingSettings.server';
import { enqueueDailySalesAutoVoucher } from '@/lib/accounting/autoVoucherQueue.server';

/** 매일 KST 00:30 — 전일 daily_reports 매출 → 자동전표처리 대기열 (Vercel cron UTC 15:30) */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = getKSTTodayYMD();
  const yesterday = addDaysYMD(today, -1);
  const uid = 'cron-daily-sales-auto-voucher';

  try {
    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
    const results: Array<{ storeId: string; ok: boolean; autoVoucherId?: string; skipped?: boolean; error?: string }> = [];

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      const settings = await loadAccountingSettings(storeId);
      if (!settings.autoVoucherFromSales) {
        results.push({
          storeId,
          ok: true,
          skipped: true,
          error: '매출 자동전표 비활성',
        });
        continue;
      }

      const result = await enqueueDailySalesAutoVoucher({
        storeId,
        reportDate: yesterday,
        uid,
        sourceScreen: '일별매출집계',
      });
      results.push({
        storeId,
        ok: result.ok,
        autoVoucherId: result.autoVoucherId,
        skipped: result.skipped,
        error: result.error,
      });
    }

    const synced = results.filter(r => r.ok && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;
    const failed = results.filter(r => !r.ok).length;

    return NextResponse.json({
      ok: true,
      date: yesterday,
      stores: storesSnap.size,
      synced,
      skipped,
      failed,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'daily-sales-auto-voucher failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
