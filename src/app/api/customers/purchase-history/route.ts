import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  fetchCustomerPurchaseReceipts,
  fetchCustomerTopItems,
} from '@/lib/customerPurchaseLines';

// GET /api/customers/purchase-history?storeId=&cusCode=
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const cusCode = searchParams.get('cusCode') || '';
  const since = searchParams.get('since') || undefined;
  const receiptLimit = Math.min(Number(searchParams.get('receiptLimit') || 12), 30);
  const topLimit = Math.min(Number(searchParams.get('topLimit') || 10), 20);

  if (!storeId || !cusCode) {
    return NextResponse.json({ error: 'storeId and cusCode required' }, { status: 400 });
  }

  try {
    const [topItems, receipts] = await Promise.all([
      fetchCustomerTopItems(storeId, cusCode, since, topLimit),
      fetchCustomerPurchaseReceipts(storeId, cusCode, receiptLimit),
    ]);

    return NextResponse.json({
      cusCode,
      topItems,
      receipts,
      hasData: topItems.length > 0 || receipts.length > 0,
    });
  } catch (err) {
    console.error('[customers/purchase-history]', err);
    return NextResponse.json({ error: 'Failed to load purchase history' }, { status: 500 });
  }
}
