import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { parseCookieInput } from '@/lib/purchase/hometaxTypes';
import {
  deleteHometaxSession,
  saveHometaxSession,
  saveHometaxSessionWithLinkCode,
} from '@/lib/purchase/hometaxSession.server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const cookies = parseCookieInput(body.cookies);
    const linkCode = String(body.linkCode || '').trim();

    if (linkCode) {
      const result = await saveHometaxSessionWithLinkCode({ linkCode, cookies });
      return NextResponse.json({ success: true, ...result, method: 'extension' });
    }

    const authUser = await verifyToken(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const storeId = String(body.storeId || '').trim();
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const result = await saveHometaxSession({
      storeId,
      uid: authUser.uid,
      cookies,
      linkMethod: 'manual',
    });

    return NextResponse.json({ success: true, ...result, method: 'manual' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '세션 저장 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId') || '';
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    await deleteHometaxSession(storeId);
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '연결 해제 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
