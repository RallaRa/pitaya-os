import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const secret = req.headers.get('x-cron-secret') || req.headers.get('authorization')?.replace('Bearer ', '');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';

  try {
    const storesSnap = await adminDb.collection('stores').where('status','==','active').limit(20).get();
    const storeIds = storesSnap.empty ? [''] : storesSnap.docs.map(d => d.id);

    const results = await Promise.allSettled(
      storeIds.map(sid =>
        fetch(`${base}/api/dashboard/total-partner?storeId=${sid}&refresh=1`, {
          signal: AbortSignal.timeout(60000),
        }).then(r => r.json())
      )
    );

    const summary = results.map((r, i) => ({
      storeId: storeIds[i],
      status: r.status,
    }));

    return NextResponse.json({ ok: true, generated: summary.length, summary });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
