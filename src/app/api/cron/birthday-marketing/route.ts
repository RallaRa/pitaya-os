import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import {
  runBirthdayMarketingAllStores,
  runBirthdayMarketingForStore,
} from '@/lib/birthdayCampaign.server';

/** 매일 오전 9시 KST — D-3 쿠폰·큐, D-0 생일 고객 메신저 알림 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const storeId = new URL(req.url).searchParams.get('storeId');

  try {
    const results = storeId
      ? [await runBirthdayMarketingForStore(storeId)]
      : await runBirthdayMarketingAllStores();
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
      ? [await runBirthdayMarketingForStore(storeId)]
      : await runBirthdayMarketingAllStores();
    return NextResponse.json({ ok: true, results, processedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
