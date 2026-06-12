import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import {
  getStockPortfolioDoc,
  getStockSettings,
} from '@/lib/stock/settings.server';
import { applyRiskActions, computeRiskSnapshot } from '@/lib/stock/risk.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const settings = await getStockSettings(auth.user.uid);
  const saved = await getStockPortfolioDoc(auth.user.uid);
  const snapshot = await computeRiskSnapshot(settings, saved);

  return NextResponse.json({ ok: true, snapshot });
}

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const body = await req.json().catch(() => ({}));
  const settings = await getStockSettings(auth.user.uid);
  const saved = await getStockPortfolioDoc(auth.user.uid);
  const snapshot = await computeRiskSnapshot(settings, saved);
  const result = await applyRiskActions({
    uid: auth.user.uid,
    settings,
    snapshot,
    autoExecute: body?.autoExecute === true,
  });

  return NextResponse.json({ ok: true, ...result });
}
