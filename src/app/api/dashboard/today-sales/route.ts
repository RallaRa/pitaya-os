import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId  = searchParams.get('storeId') || '';
  const todayStr = toYMD(new Date(Date.now() + 9 * 60 * 60 * 1000));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    // 당일 daily_reports (orderBy 없이 클라이언트 정렬 — 복합 인덱스 불필요)
    const snap = await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '==', todayStr)
      .limit(10)
      .get();

    if (snap.empty) {
      return NextResponse.json({ todayStr, totalSales: 0, netSales: 0, customerCount: 0, noData: true });
    }

    // pos_bridge 우선, 없으면 lastModifiedAt 기준 최신
    const docs = snap.docs
      .map(d => ({ id: d.id, ...d.data() } as any))
      .sort((a: any, b: any) => (b.lastModifiedAt?.toMillis?.() ?? 0) - (a.lastModifiedAt?.toMillis?.() ?? 0));
    const best = docs.find((d: any) => d.source === 'pos_bridge') || docs[0];

    const totalSales    = best.totalSales    ?? 0;
    const returnAmount  = best.returnAmount  ?? 0;
    const discountAmount= best.discountAmount?? 0;
    const netSales      = best.netSales ?? best.netSale ?? (totalSales - returnAmount - discountAmount);
    const customerCount = best.customerCount ?? 0;
    const isClosed      = best.isClosed      ?? false;
    const syncedAt      = best.syncedAt      ?? null;

    // 전일 비교
    const yesterdayStr = toYMD(new Date(Date.now() + 9 * 60 * 60 * 1000 - 86400000));
    const ySnap = await adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '==', yesterdayStr)
      .limit(5)
      .get();

    let yesterdayNet = 0;
    if (!ySnap.empty) {
      const yDocs = ySnap.docs.map(d => d.data() as any);
      const yBest = yDocs.find(d => d.source === 'pos_bridge') || yDocs[0];
      const yt = yBest.totalSales ?? 0;
      yesterdayNet = yBest.netSales ?? yBest.netSale ?? (yt - (yBest.returnAmount ?? 0) - (yBest.discountAmount ?? 0));
    }

    const diffAmt = netSales - yesterdayNet;
    const diffPct = yesterdayNet > 0 ? Math.round((diffAmt / yesterdayNet) * 100) : null;

    return NextResponse.json({
      todayStr,
      totalSales,
      netSales,
      returnAmount,
      customerCount,
      isClosed,
      syncedAt,
      yesterdayNet,
      diffAmt,
      diffPct,
      noData: false,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
