import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

function formatYMD(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const base    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';

  // 3개 외부 API + Firestore 매출 병렬 fetch
  const [priceRes, auctionRes, trendRes, salesData] = await Promise.allSettled([
    fetch(`${base}/api/external/meat-price`, { signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    fetch(`${base}/api/external/meat-auction`, { signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    fetch(`${base}/api/external/naver-trend${storeId ? `?storeId=${storeId}` : ''}`, { signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    (async () => {
      const since = new Date();
      since.setDate(since.getDate() - 30);
      const sinceStr = formatYMD(since);

      let q: FirebaseFirestore.Query = adminDb.collection('daily_reports')
        .where('reportDate', '>=', sinceStr);
      if (storeId) q = q.where('storeId', '==', storeId);

      const snap = await q.limit(200).get();
      const itemMap: Record<string, { qty: number; amount: number }> = {};

      snap.docs.forEach(doc => {
        const items: any[] = doc.data().items || [];
        items.forEach((item: any) => {
          const name = item.name || '(알 수 없음)';
          if (!itemMap[name]) itemMap[name] = { qty: 0, amount: 0 };
          itemMap[name].qty    += Number(item.qty    || 0);
          itemMap[name].amount += Number(item.netSales || item.amount || 0);
        });
      });

      return Object.entries(itemMap)
        .map(([name, v]) => ({ name, ...v }))
        .sort((a, b) => b.qty - a.qty)
        .slice(0, 20);
    })(),
  ]);

  return NextResponse.json({
    meatPrices:  priceRes.status   === 'fulfilled' ? priceRes.value   : null,
    meatAuction: auctionRes.status === 'fulfilled' ? auctionRes.value : null,
    naverTrends: trendRes.status   === 'fulfilled' ? trendRes.value   : null,
    salesItems:  salesData.status  === 'fulfilled' ? salesData.value  : null,
    fetchedAt:   new Date().toISOString(),
  });
}
