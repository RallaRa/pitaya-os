import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  getHometaxSessionStatus,
  verifyHometaxSession,
} from '@/lib/purchase/hometaxSession.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const verify = searchParams.get('verify') === '1';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const status = await getHometaxSessionStatus(storeId);
    if (verify && status.connected) {
      const check = await verifyHometaxSession(storeId);
      const refreshed = await getHometaxSessionStatus(storeId);
      return NextResponse.json({ ...refreshed, verify: check });
    }
    return NextResponse.json(status);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
