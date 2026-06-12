import { NextResponse } from 'next/server';
import { requireSuperuser } from '@/lib/devAuth';
import { getStockTraderConfig, stockTraderFetch } from '@/lib/stock-trader/client';

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
      error: 'STOCK_TRADER_API_TOKEN 미설정',
      baseUrl: cfg.baseUrl,
    });
  }

  try {
    const health = await stockTraderFetch<{ ok?: boolean; service?: string }>('/health');
    const status = await stockTraderFetch<Record<string, unknown>>('/api/status');
    return NextResponse.json({ ok: true, configured: true, baseUrl: cfg.baseUrl, health, status });
  } catch (e: unknown) {
    return NextResponse.json({
      ok: false,
      configured: true,
      baseUrl: cfg.baseUrl,
      error: e instanceof Error ? e.message : String(e),
    }, { status: 502 });
  }
}
