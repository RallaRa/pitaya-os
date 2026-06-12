import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getStockTraderConfig, stockTraderFetch, shouldUseLocalKis } from '@/lib/stock-trader/client';
import { getTradingStatus } from '@/lib/stock/kisConfig.server';

export const dynamic = 'force-dynamic';

/** GET /api/stock-trader/health — 연동 상태 (슈퍼유저) */
export async function GET(req: Request) {
  const auth = await requireSuperuser(req);
  if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const cfg = getStockTraderConfig();
  if (!cfg.configured) {
    return NextResponse.json({
      ok: false,
      configured: false,
      error: 'KIS 미설정 — Vercel에 KIS_APP_KEY, KIS_APP_SECRET, KIS_ACCOUNT_NO 추가',
      baseUrl: cfg.baseUrl,
    });
  }

  if (shouldUseLocalKis()) {
    const trading = getTradingStatus();
    return NextResponse.json({
      ok: true,
      configured: true,
      mode: 'direct',
      baseUrl: 'vercel-builtin-kis',
      health: { ok: true, service: 'pitaya-os-kis-direct' },
      status: { ok: true, kis: trading.kis, alpaca: trading.alpaca, trading },
    });
  }

  try {
    const health = await stockTraderFetch<{ ok?: boolean; service?: string }>('/health');
    const status = await stockTraderFetch<Record<string, unknown>>('/api/status');
    return NextResponse.json({ ok: true, configured: true, mode: 'proxy', baseUrl: cfg.baseUrl, health, status });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      configured: true,
      mode: 'proxy',
      baseUrl: cfg.baseUrl,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}
