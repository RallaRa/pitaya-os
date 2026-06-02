import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getKSTHour } from '@/lib/dateUtils';
import { PREDICTION_UPDATE_SLOTS_KST } from '@/lib/predictionDailyLock';
import { isCronAuthorized, cronUnauthorizedResponse, getCronSecret } from '@/lib/cronAuth';

/**
 * KST 00·10·15·18시 슬롯에만 전 매장 AI 예측 갱신 (refresh=1)
 * GitHub Actions에서 ?slot=0|10|15|18 로 호출 (Vercel Hobby cron 대체)
 */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const slotParam = new URL(req.url).searchParams.get('slot');
  let slotHour = getKSTHour();

  if (slotParam != null && slotParam !== '') {
    const parsed = Number(slotParam);
    if (!PREDICTION_UPDATE_SLOTS_KST.includes(parsed as (typeof PREDICTION_UPDATE_SLOTS_KST)[number])) {
      return NextResponse.json({
        error: `invalid slot (use ${PREDICTION_UPDATE_SLOTS_KST.join('|')})`,
      }, { status: 400 });
    }
    slotHour = parsed;
  } else if (!PREDICTION_UPDATE_SLOTS_KST.includes(slotHour as (typeof PREDICTION_UPDATE_SLOTS_KST)[number])) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      kstHour: slotHour,
      reason: 'not an AI slot hour (use ?slot=0|10|15|18)',
    });
  }

  try {
    const storesSnap = await adminDb.collection('stores').get();
    const storeIds = storesSnap.docs.map(d => d.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
    const cronSecret = getCronSecret();

    const results = await Promise.allSettled(
      storeIds.map(id =>
        fetch(`${baseUrl}/api/dashboard/sales-prediction?storeId=${id}&refresh=1`, {
          headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
        }).then(r => r.json()),
      ),
    );

    const ok = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ ok: true, kstHour: slotHour, processed: ok, total: storeIds.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
