import { NextResponse } from 'next/server';
import { listHometaxAutoSyncStores } from '@/lib/purchase/hometaxSession.server';
import { syncCardExpensesToAutoVoucherQueue } from '@/lib/accounting/autoVoucherQueue.server';
import { autoReleaseMatchedPurchases } from '@/lib/purchase/purchaseReconciliation.server';
import { syncHometaxEvidence } from '@/lib/purchase/hometaxSync.server';

/** 매일 KST 07:00 — 자동 동기화 활성 매장 홈택스 증빙 수집 (Vercel cron UTC 22:00) */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const uid = 'cron-hometax-sync';

  try {
    const targets = await listHometaxAutoSyncStores();
    const results: Array<{
      storeId: string;
      ok: boolean;
      imported: number;
      skipped: number;
      message: string;
      errors: string[];
    }> = [];

    for (const target of targets) {
      try {
        const result = await syncHometaxEvidence({
          storeId: target.storeId,
          uid,
          lookbackDays: target.syncLookbackDays,
          trigger: 'cron',
        });
        let expenseSynced = 0;
        let purchaseReleased = 0;
        if (result.ok) {
          const purchaseResult = await autoReleaseMatchedPurchases({
            storeId: target.storeId,
            uid,
          });
          purchaseReleased = purchaseResult.released;

          const expenseResult = await syncCardExpensesToAutoVoucherQueue(target.storeId, uid);
          expenseSynced = expenseResult.synced;
        }

        const extras: string[] = [];
        if (purchaseReleased > 0) extras.push(`매입전표 ${purchaseReleased}건`);
        if (expenseSynced > 0) extras.push(`경비전표 ${expenseSynced}건`);

        results.push({
          storeId: target.storeId,
          ok: result.ok,
          imported: result.imported.total,
          skipped: result.skipped.total,
          message: extras.length > 0
            ? `${result.message} · ${extras.join(' · ')}`
            : result.message,
          errors: result.errors,
        });
      } catch (e) {
        results.push({
          storeId: target.storeId,
          ok: false,
          imported: 0,
          skipped: 0,
          message: e instanceof Error ? e.message : 'sync failed',
          errors: [String(e)],
        });
      }
    }

    const importedTotal = results.reduce((sum, r) => sum + r.imported, 0);
    const skippedTotal = results.reduce((sum, r) => sum + r.skipped, 0);
    const failed = results.filter(r => !r.ok && r.errors.length > 0).length;

    return NextResponse.json({
      ok: true,
      stores: targets.length,
      importedTotal,
      skippedTotal,
      failed,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'hometax-sync cron failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
