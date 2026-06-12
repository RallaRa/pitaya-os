import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listHometaxSyncLogs } from '@/lib/purchase/hometaxSyncLog.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const limit = Math.min(50, Math.max(1, Number(searchParams.get('limit') || 15)));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const logs = await listHometaxSyncLogs(storeId, limit);
    return NextResponse.json({ logs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '이력 조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
