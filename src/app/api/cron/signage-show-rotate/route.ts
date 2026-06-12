import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import {
  runSignageShowRotation,
  runSignageShowRotationForAllStores,
} from '@/lib/signage/signageShowRotate.server';

/** 4시간마다 — 사이니지 AI 쇼 자동 로테이션 (인기/Pick 품목) */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = body?.storeId ? String(body.storeId) : undefined;

    if (storeId) {
      const result = await runSignageShowRotation(storeId);
      return NextResponse.json({ ok: true, results: [result] });
    }

    const results = await runSignageShowRotationForAllStores();
    const rotated = results.filter(r => !r.skipped);
    return NextResponse.json({
      ok: true,
      total: results.length,
      rotated: rotated.length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'signage-show-rotate cron — 4h hot/pick item rotation',
  });
}
