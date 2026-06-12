import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { computePurchaseAnalytics } from '@/lib/customerPurchaseAnalytics';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const anchorKeyword = searchParams.get('anchor') || '삼겹';

  try {
    const data = await computePurchaseAnalytics(storeId, { anchorKeyword });
    return NextResponse.json({
      anchorKeyword: data.coPurchase.anchorKeyword,
      anchorReceiptCount: data.coPurchase.anchorReceiptCount,
      totalReceiptCount: data.coPurchase.totalReceiptCount,
      pairs: data.coPurchase.pairs.slice(0, 6),
      sinceYmd: data.sinceYmd,
      emptyReason: data.coPurchase.pairs.length === 0
        ? `최근 90일 '${anchorKeyword}' 기준 공동구매 데이터가 없습니다.`
        : null,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dashboard/co-purchase]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
