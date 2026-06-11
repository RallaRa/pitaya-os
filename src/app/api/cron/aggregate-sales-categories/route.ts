import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { rebuildSalesCategoriesFromDailyReport } from '@/lib/pos/salesCategoryAggregate.server';

/** 매일 자정(KST) — 전일 daily_reports 기준 sales_categories 재집계 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const today = getKSTTodayYMD();
  const yesterday = addDaysYMD(today, -1);

  try {
    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
    let rebuilt = 0;
    let skipped = 0;

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      const ok = await rebuildSalesCategoriesFromDailyReport(storeId, yesterday);
      if (ok) rebuilt += 1;
      else skipped += 1;
    }

    return NextResponse.json({
      ok: true,
      date: yesterday,
      rebuilt,
      skipped,
      stores: storesSnap.size,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'aggregate-sales-categories failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
