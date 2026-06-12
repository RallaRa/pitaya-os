import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getLatestScores } from '@/lib/stock/factorScoring.server';
import { buildBacktestSim } from '@/lib/stock/backtestSim.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const latest = await getLatestScores();
  const sim = buildBacktestSim(latest);

  return NextResponse.json({
    ok: true,
    ...sim,
    scores: latest,
  });
}
