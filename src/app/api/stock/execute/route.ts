import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getStockSettings } from '@/lib/stock/settings.server';
import { runAiExecutionCycle, listRecentOrders } from '@/lib/stock/execution.server';
import { getLatestScores } from '@/lib/stock/factorScoring.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const orders = await listRecentOrders(auth.user.uid);
  return NextResponse.json({ ok: true, orders });
}

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const body = await req.json().catch(() => ({}));
  const dryRun = body?.dryRun === true;
  const settings = await getStockSettings(auth.user.uid);

  const scores = await getLatestScores();
  const top = (scores?.top20 as Array<{
    symbol: string;
    name: string;
    price: number;
    buyProbability: number;
  }> | undefined)?.[0];

  const result = await runAiExecutionCycle({
    uid: auth.user.uid,
    settings,
    topPick: top,
    aiReason: String(body?.aiReason || 'AI 자동 실행'),
    dryRun,
  });

  if (!result.ok) {
    return NextResponse.json(result, { status: 400 });
  }

  return NextResponse.json(result);
}
