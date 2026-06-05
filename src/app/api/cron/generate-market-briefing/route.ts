import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { cronUnauthorizedResponse, getCronSecret, isCronAuthorized } from '@/lib/cronAuth';

/** KST 05:30 전후 — AI 오늘 브리핑 캐시 사전 생성 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  const cronSecret = getCronSecret();

  try {
    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(20).get();
    const storeIds = storesSnap.empty ? [''] : storesSnap.docs.map(d => d.id);

    const results = await Promise.allSettled(
      storeIds.map(sid =>
        fetch(`${base}/api/dashboard/comprehensive-opinion?storeId=${sid}&force=1`, {
          headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
          signal: AbortSignal.timeout(90000),
        }).then(r => r.json()),
      ),
    );

    const summary = results.map((r, i) => ({
      storeId: storeIds[i],
      status: r.status,
      ok: r.status === 'fulfilled' && !(r.value as { error?: string; aiError?: boolean })?.error
        && !(r.value as { aiError?: boolean })?.aiError,
    }));

    return NextResponse.json({ ok: true, generated: summary.length, summary });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
