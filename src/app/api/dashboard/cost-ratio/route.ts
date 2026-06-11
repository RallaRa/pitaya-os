import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { loadCostRatioDetail } from '@/lib/costRatio';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const detail = await loadCostRatioDetail(storeId);
  return NextResponse.json({
    storeAvgRatio: detail.storeAvgRatio,
    globalTargetRatio: detail.globalTargetRatio,
    itemCount: detail.itemCount,
    items: detail.items,
    offenders: detail.offenders.slice(0, 20),
  });
}
