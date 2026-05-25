import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    // 전체 매장 조회 후 각각 예측 갱신
    const storesSnap = await adminDb.collection('stores').get();
    const storeIds = storesSnap.docs.map(d => d.id);

    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
    const results = await Promise.allSettled(
      storeIds.map(id =>
        fetch(`${baseUrl}/api/dashboard/sales-prediction?storeId=${id}&refresh=1`)
          .then(r => r.json())
      )
    );

    const ok = results.filter(r => r.status === 'fulfilled').length;
    return NextResponse.json({ ok: true, processed: ok, total: storeIds.length });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
