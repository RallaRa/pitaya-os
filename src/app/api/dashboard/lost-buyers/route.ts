import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getLostBuyerSummary } from '@/lib/lostBuyerStats';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const summary = await getLostBuyerSummary(storeId);
    return NextResponse.json(summary);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[dashboard/lost-buyers]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
