import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { getKSTParts } from '@/lib/dateUtils';
import {
  runProfitShareAllStores,
  runProfitSharePayroll,
} from '@/lib/hr-system/profitSharePayroll.server';

/** 매월 25일 00:00 KST — 영업이익 분배 급여 자동 생성 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const { day } = getKSTParts();
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const storeId = url.searchParams.get('storeId');
  const period = url.searchParams.get('period') || new Date().toISOString().slice(0, 7);

  if (!force && day !== 25) {
    return NextResponse.json({ ok: true, skipped: true, reason: `KST day=${day}, not 25th` });
  }

  try {
    if (storeId) {
      const out = await runProfitSharePayroll(storeId, period, 'cron');
      return NextResponse.json({ ok: true, storeId, ...out });
    }
    const results = await runProfitShareAllStores('cron');
    return NextResponse.json({ ok: true, period, results, processedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
