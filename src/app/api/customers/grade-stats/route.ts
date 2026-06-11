import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getStoreGradeStats } from '@/lib/customerGrade.server';

/** GET /api/customers/grade-stats?storeId= */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const stats = await getStoreGradeStats(storeId);
    return NextResponse.json({ ok: true, ...stats });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
