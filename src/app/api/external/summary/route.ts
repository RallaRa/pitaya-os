import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD, addDaysYMD } from '@/lib/dateUtils';
import { fetchStoreItemSales } from '@/lib/dashboardSalesData';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const base    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';

  const authHdr = req.headers.get('Authorization') || '';
  const hdrs    = { Authorization: authHdr };

  // 3개 외부 API + Firestore 매출 병렬 fetch
  const [priceRes, auctionRes, trendRes, salesItems] = await Promise.allSettled([
    fetch(`${base}/api/external/meat-price`, { headers: hdrs, signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    fetch(`${base}/api/external/meat-auction`, { headers: hdrs, signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    fetch(`${base}/api/external/naver-trend${storeId ? `?storeId=${storeId}` : ''}`, { headers: hdrs, signal: AbortSignal.timeout(12000) }).then(r => r.json()),
    storeId ? fetchStoreItemSales(storeId, 30, 20) : Promise.resolve([]),
  ]);

  return NextResponse.json({
    meatPrices:  priceRes.status   === 'fulfilled' ? priceRes.value   : null,
    meatAuction: auctionRes.status === 'fulfilled' ? auctionRes.value : null,
    naverTrends: trendRes.status   === 'fulfilled' ? trendRes.value   : null,
    salesItems:  salesItems.status  === 'fulfilled' ? salesItems.value  : null,
    fetchedAt:   new Date().toISOString(),
  });
}
