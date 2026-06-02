import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getDriveAuthUrl } from '@/lib/googleDrive';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const storeId = new URL(req.url).searchParams.get('storeId')?.trim();
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  if (!clientId || !clientSecret) {
    return NextResponse.json(
      { error: 'GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET 설정이 필요합니다' },
      { status: 503 },
    );
  }

  // 팝업 방식(redirect_uri 등록 불필요) — 기본
  const mode = new URL(req.url).searchParams.get('mode');
  if (mode !== 'redirect') {
    return NextResponse.json({ mode: 'popup', clientId });
  }

  // 레거시 리다이렉트 방식 (Console에 redirect URI 등록 필요)
  return NextResponse.json({ mode: 'redirect', url: getDriveAuthUrl(storeId) });
}
