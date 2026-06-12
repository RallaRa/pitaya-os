import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getStockSettings } from '@/lib/stock/settings.server';
import { runMarketScan } from '@/lib/stock/scan.server';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** POST /api/stock/scan — 유니버스 → 팩터스코어 → AI 분석 (마스터 OFF 가능) */
export async function POST(req: Request) {
  try {
    const auth = await requireStockSuperuser(req);
    if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

    const settings = await getStockSettings(auth.user.uid);
    const result = await runMarketScan(auth.user.uid, settings);

    return NextResponse.json(result, { status: result.ok ? 200 : 502 });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json(
      {
        ok: false,
        error: msg,
        errors: [msg],
        steps: {
          universe: { ok: false, error: msg },
          scores: { ok: false, error: 'skipped' },
          ai: { ok: false, error: 'skipped' },
        },
      },
      { status: 500 },
    );
  }
}
