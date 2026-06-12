import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import {
  getEngineState,
  getStockSettings,
} from '@/lib/stock/settings.server';
import { runUniverseFilter } from '@/lib/stock/universe.server';
import {
  computeFactorScores,
  getLatestScores,
  saveFactorScores,
} from '@/lib/stock/factorScoring.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const latest = await getLatestScores();
  return NextResponse.json({ ok: true, scores: latest });
}

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const settings = await getStockSettings(auth.user.uid);
  const engine = await getEngineState(auth.user.uid);
  const strategyMode = String(engine?.strategyMode || engine?.marketRegime || 'balanced');

  const universe = await runUniverseFilter(settings, strategyMode);
  const rows = computeFactorScores(universe.passed, settings, strategyMode);
  const weights = settings.factorWeights;
  const date = await saveFactorScores(auth.user.uid, rows, weights, strategyMode);

  return NextResponse.json({
    ok: true,
    date,
    top20: rows,
    weights,
    strategyMode,
  });
}
