import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { fetchCustomerRequestSummaries } from '@/lib/customerRequestLog.server';

function checkBridgeAuth(req: Request): boolean {
  const apiKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-api-key') ||
    '';
  return !!process.env.POS_BRIDGE_KEY && apiKey === process.env.POS_BRIDGE_KEY;
}

// GET /api/pos/customer-requests?storeId=&cusCode=&limit=5
export async function GET(req: Request) {
  if (!checkBridgeAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const cusCode = searchParams.get('cusCode') || '';
  const limit = Math.min(parseInt(searchParams.get('limit') || '5', 10) || 5, 10);

  if (!storeId || !cusCode) {
    return NextResponse.json({ error: 'storeId and cusCode required' }, { status: 400 });
  }

  try {
    const [requests, custSnap] = await Promise.all([
      fetchCustomerRequestSummaries(storeId, cusCode, limit),
      adminDb.collection('pos_customers').doc(`${storeId}_${cusCode}`).get(),
    ]);

    const cust = custSnap.data();
    const customerName = String(cust?.nameMasked || cust?.name || '').trim();

    return NextResponse.json({
      storeId,
      cusCode,
      customerName,
      requestCount: requests.length,
      requests: requests.map(r => ({
        id: r.id,
        requestDate: r.requestDate,
        requestTime: r.requestTime,
        dayOfWeek: r.dayOfWeek,
        content: r.content,
        attachmentCount: r.attachments?.length || 0,
      })),
    });
  } catch (err) {
    console.error('[pos/customer-requests]', err);
    return NextResponse.json({ error: 'Failed to load customer requests' }, { status: 500 });
  }
}
