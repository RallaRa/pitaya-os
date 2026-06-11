import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import { getStockThresholds, saveStockThresholds, type StockThresholdRow } from '@/lib/pos/stockWarning.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
  if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const thresholds = await getStockThresholds(storeId);
  return NextResponse.json({ storeId, thresholds });
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { storeId?: string; thresholds?: StockThresholdRow[] };
  const { storeId, thresholds } = body;
  if (!storeId || !Array.isArray(thresholds)) {
    return NextResponse.json({ error: 'storeId, thresholds[] 필요' }, { status: 400 });
  }
  if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const saved = await saveStockThresholds(storeId, thresholds);
  return NextResponse.json({ success: true, thresholds: saved });
}
