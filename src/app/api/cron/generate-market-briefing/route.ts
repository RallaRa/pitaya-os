import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { cronUnauthorizedResponse, getCronSecret, isCronAuthorized } from '@/lib/cronAuth';
import { postDailyBriefingToMessenger } from '@/lib/briefingMessenger';

/** KST 09:00 — AI 오늘 브리핑 캐시 생성 + 메신저 전송 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  const cronSecret = getCronSecret();

  try {
    const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').limit(20).get();
    if (storesSnap.empty) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'no active stores' });
    }
    const storeIds = storesSnap.docs.map(d => d.id);

    const results = await Promise.allSettled(
      storeIds.map(async sid => {
        const res = await fetch(`${base}/api/dashboard/comprehensive-opinion?storeId=${sid}&force=1`, {
          headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
          signal: AbortSignal.timeout(90000),
        });
        const data = await res.json();
        if (sid && (data.summary || data.opinion)) {
          try {
            await postDailyBriefingToMessenger(
              sid,
              String(data.summary || data.opinion || ''),
              Array.isArray(data.actions) ? data.actions.map((a: { label?: string; text?: string }) => a.label || a.text || '') : [],
            );
          } catch { /* ignore messenger errors */ }
        }
        return data;
      }),
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
