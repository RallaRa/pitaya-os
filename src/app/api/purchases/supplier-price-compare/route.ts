import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildSupplierPriceCompare } from '@/lib/costRatio';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const rows = await buildSupplierPriceCompare(storeId);
  return NextResponse.json({ rows });
}
