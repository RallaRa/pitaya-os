import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { cronUnauthorizedResponse, isCronAuthorized } from '@/lib/cronAuth';
import { backfillStoreDailyItemStatsFromDailyReports } from '@/lib/storeDailyItemStats';

/** KST 새벽 — daily_reports → store_daily_item_stats 누락분 보강 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const today = getKSTTodayYMD();
  const since90 = addDaysYMD(today, -90);

  try {
    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(20).get();
    const storeIds = storesSnap.docs.map(d => d.id);

    const results = await Promise.allSettled(
      storeIds.map(async storeId => {
        const written = await backfillStoreDailyItemStatsFromDailyReports(storeId, since90, today);
        return { storeId, written };
      }),
    );

    const summary = results.map((r, i) => ({
      storeId: storeIds[i],
      status: r.status,
      written: r.status === 'fulfilled' ? r.value.written : 0,
    }));

    return NextResponse.json({ ok: true, since: since90, until: today, summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
