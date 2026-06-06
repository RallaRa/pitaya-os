import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getCustomerVisitSummary } from '@/lib/customerVisitStats';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const summary = await getCustomerVisitSummary(storeId);
    return NextResponse.json(summary);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    console.error('[customer-visit-summary]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
