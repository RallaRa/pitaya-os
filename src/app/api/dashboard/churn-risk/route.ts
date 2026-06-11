import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listChurnRiskCustomers } from '@/lib/customerChurnScore.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const minScore = Number(searchParams.get('minScore') || 70);
  const limit = Number(searchParams.get('limit') || 10);

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const result = await listChurnRiskCustomers(storeId, {
      minScore: Number.isFinite(minScore) ? minScore : 70,
      limit: Number.isFinite(limit) ? limit : 10,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
