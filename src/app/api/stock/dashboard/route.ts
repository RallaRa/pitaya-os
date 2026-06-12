import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { fetchKisPortfolio, isKisConfigured } from '@/lib/stock/kisPortfolio.server';
import {
  getEngineState,
  getStockPortfolioDoc,
  getStockSettings,
  saveStockPortfolio,
} from '@/lib/stock/settings.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const uid = auth.user.uid;
  const settings = await getStockSettings(uid);
  const saved = await getStockPortfolioDoc(uid);
  const engine = await getEngineState(uid);

  let kis = null;
  let kisError: string | null = null;
  if (isKisConfigured()) {
    try {
      kis = await fetchKisPortfolio();
      await saveStockPortfolio(uid, {
        totalEval: kis.totalEval,
        cash: kis.cash,
        holdings: kis.holdings,
        syncedAt: new Date().toISOString(),
      });
    } catch (e: unknown) {
      kisError = e instanceof Error ? e.message : String(e);
    }
  } else {
    kisError = 'KIS 미설정 — Vercel env: KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO';
  }

  const holdings = kis?.holdings || (saved?.holdings as unknown[]) || [];
  const totalEval = kis?.totalEval ?? (saved?.totalEval as number) ?? 0;
  const cash = kis?.cash ?? (saved?.cash as number) ?? 0;

  const invested = holdings.reduce((s: number, h: { evalAmt?: number }) => s + (h.evalAmt || 0), 0);
  const cashRatio = totalEval > 0 ? (cash / totalEval) * 100 : 100;

  return NextResponse.json({
    ok: true,
    portfolio: {
      totalEval,
      cash,
      cashRatio,
      invested,
      todayPnl: saved?.todayPnl ?? 0,
      totalReturnPct: saved?.totalReturnPct ?? 0,
      sharpe: saved?.sharpe ?? 0,
      mdd: saved?.mdd ?? 0,
      aiConfidence: engine?.aiConfidence ?? 0.78,
      strategyMode: engine?.strategyMode ?? 'balanced',
      lastTradeAt: engine?.lastTradeAt ?? null,
      lastTradeResult: engine?.lastTradeResult ?? null,
      nextAction: engine?.nextAction ?? '시장 스캔 대기',
      aiReason: engine?.aiReason ?? 'AI 엔진 초기화 — 마스터 스위치 ON 후 자동 분석',
    },
    holdings,
    settings,
    engine,
    kis: kis ? { paper: kis.paper, live: kis.live } : null,
    kisError,
  });
}
