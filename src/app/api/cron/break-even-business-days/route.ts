import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { refreshAllStoresBreakEvenBusinessDays, refreshBreakEvenBusinessDays } from '@/lib/breakEven.server';

/** 매월 1일 00:00 UTC (09:00 KST) — 당월 영업일수 갱신 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const storeId = new URL(req.url).searchParams.get('storeId');

  try {
    const results = storeId
      ? [{ storeId, ...(await refreshBreakEvenBusinessDays(storeId)) }]
      : await refreshAllStoresBreakEvenBusinessDays();
    return NextResponse.json({ ok: true, results, processedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  let storeId: string | null = null;
  try {
    const body = await req.json().catch(() => ({}));
    if (body?.storeId) storeId = String(body.storeId);
  } catch { /* optional */ }

  try {
    const results = storeId
      ? [{ storeId, ...(await refreshBreakEvenBusinessDays(storeId)) }]
      : await refreshAllStoresBreakEvenBusinessDays();
    return NextResponse.json({ ok: true, results, processedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
