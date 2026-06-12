import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { fetchBriefingActionAttribution } from '@/lib/briefing/briefingActionLog.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const days = Math.min(14, Math.max(1, Number(searchParams.get('days') || 7)));

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const data = await fetchBriefingActionAttribution(storeId, days);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
