import { NextResponse } from 'next/server';
import { processItemSpeedCheck, type ItemSpeedRow } from '@/lib/pos/itemSpeed.server';

export async function POST(req: Request) {
  const authHeader = req.headers.get('authorization');
  const apiKey = authHeader?.replace('Bearer ', '') || req.headers.get('x-api-key');
  if (!process.env.POS_BRIDGE_KEY || apiKey !== process.env.POS_BRIDGE_KEY) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: {
    storeId?: string;
    date?: string;
    windowStart?: string;
    windowEnd?: string;
    items?: ItemSpeedRow[];
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId || process.env.POS_STORE_ID || '';
  const date = body.date || '';
  const windowStart = body.windowStart || '';
  const windowEnd = body.windowEnd || '';
  const items = Array.isArray(body.items) ? body.items : [];

  if (!storeId || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'storeId and date required' }, { status: 400 });
  }
  if (!/^\d{2}:\d{2}$/.test(windowStart) || !/^\d{2}:\d{2}$/.test(windowEnd)) {
    return NextResponse.json({ error: 'windowStart/windowEnd (HH:mm) required' }, { status: 400 });
  }

  try {
    const result = await processItemSpeedCheck(storeId, {
      date,
      windowStart,
      windowEnd,
      items,
    });
    return NextResponse.json({ success: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'item-speed-check failed';
    console.error('[pos/item-speed-check]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
