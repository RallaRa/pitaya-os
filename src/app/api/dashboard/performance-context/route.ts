import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildPerformanceContext } from '@/lib/performanceContext.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const context = await buildPerformanceContext(storeId);
    return NextResponse.json(context);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[performance-context]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
