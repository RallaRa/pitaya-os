import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getKSTHour } from '@/lib/dateUtils';
import { PREDICTION_UPDATE_SLOTS_KST } from '@/lib/predictionDailyLock';

/**
 * KST 00·10·15·18시 슬롯에만 전 매장 AI 예측 갱신 (refresh=1)
 * Vercel cron(UTC): 15:05, 01:05, 06:05, 09:05
 */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const hour = getKSTHour();
  if (!PREDICTION_UPDATE_SLOTS_KST.includes(hour as (typeof PREDICTION_UPDATE_SLOTS_KST)[number])) {
    return NextResponse.json({ ok: true, skipped: true, kstHour: hour, reason: 'not an AI slot hour' });
  }

  try {
    const storesSnap = await adminDb.collection('stores').get();
    const storeIds = storesSnap.docs.map(d => d.id);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
    const cronSecret = process.env.CRON_SECRET || '';

    const results = await Promise.allSettled(
      storeIds.map(id =>
        fetch(`${baseUrl}/api/dashboard/sales-prediction?storeId=${id}&refresh=1`, {
          headers: cronSecret ? { 'x-cron-secret': cronSecret } : {},
        }).then(r => r.json()),
      ),
    );

    const ok = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ ok: true, kstHour: hour, processed: ok, total: storeIds.length });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
