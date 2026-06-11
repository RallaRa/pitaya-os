import { NextResponse } from 'next/server';
import { processFirstPurchaseEvents } from '@/lib/pos/firstPurchaseNotify.server';
import { processSaleEvents, type SaleEventInput } from '@/lib/pos/saleEventNotify.server';
import { processVipVisitEvents } from '@/lib/pos/vipVisitNotify.server';

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-api-key');
  if (!process.env.POS_BRIDGE_KEY || apiKey !== process.env.POS_BRIDGE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storeId?: string; date?: string; events?: SaleEventInput[] };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || process.env.POS_STORE_ID || '';
  const date = body.date || '';
  const events = Array.isArray(body.events) ? body.events : [];

  if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'storeId and date required' }, { status: 400 });
  }

  try {
    const [saleResult, firstPurchaseResult, vipVisitResult] = await Promise.all([
      processSaleEvents(storeId, date, events),
      processFirstPurchaseEvents(storeId, date, events),
      processVipVisitEvents(storeId, date, events),
    ]);
    return NextResponse.json({
      success: true,
      ...saleResult,
      firstPurchase: firstPurchaseResult,
      vipVisit: vipVisitResult,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'sale-events failed';
    console.error('[pos/sale-events]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
