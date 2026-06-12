import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getEngineState, getStockSettings } from '@/lib/stock/settings.server';
import { runUniverseFilter, getLatestUniverse } from '@/lib/stock/universe.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const latest = await getLatestUniverse();
  return NextResponse.json({ ok: true, universe: latest });
}

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const settings = await getStockSettings(auth.user.uid);
  const engine = await getEngineState(auth.user.uid);
  const strategyMode = String(engine?.strategyMode || engine?.marketRegime || 'balanced');

  const result = await runUniverseFilter(settings, strategyMode);
  return NextResponse.json({ ok: true, ...result });
}
