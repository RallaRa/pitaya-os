import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { computePurchaseAnalytics } from '@/lib/customerPurchaseAnalytics';

// GET /api/customers/purchase-analytics?storeId=&anchor=삼겹&since=YYYY-MM-DD
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const anchorKeyword = searchParams.get('anchor') || '삼겹';
  const sinceYmd = searchParams.get('since') || undefined;

  try {
    const data = await computePurchaseAnalytics(storeId, { sinceYmd, anchorKeyword });
    return NextResponse.json(data);
  } catch (err) {
    console.error('[customers/purchase-analytics]', err);
    return NextResponse.json({ error: 'Failed to load purchase analytics' }, { status: 500 });
  }
}
