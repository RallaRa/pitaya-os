import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { createHometaxLinkCode } from '@/lib/purchase/hometaxSession.server';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const link = await createHometaxLinkCode(storeId, authUser.uid);
    return NextResponse.json({ success: true, ...link });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '코드 생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
