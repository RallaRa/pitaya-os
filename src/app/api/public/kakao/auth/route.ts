import { NextResponse } from 'next/server';
import { getKakaoRestApiKey, getKakaoJsKey } from '@/lib/kakao/config';

export const dynamic = 'force-dynamic';

const PUBLIC_KAKAO_SCOPES = [
  'profile_nickname',
  'gender',
  'age_range',
].join(',');

/** GET — 공개주문 카카오 프로필(성별·연령대) OAuth 시작 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const returnTo = searchParams.get('returnTo') || '/';
  const restKey = getKakaoRestApiKey();

  if (!restKey) {
    return NextResponse.json({ error: '카카오 설정 없음' }, { status: 500 });
  }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  const redirectUri = `${base}/api/public/kakao/callback`;
  const state = Buffer.from(JSON.stringify({ returnTo })).toString('base64url');

  const url = new URL('https://kauth.kakao.com/oauth/authorize');
  url.searchParams.set('client_id', restKey);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', PUBLIC_KAKAO_SCOPES);
  url.searchParams.set('state', state);

  return NextResponse.redirect(url.toString());
}

export async function POST() {
  return NextResponse.json({
    jsKey: getKakaoJsKey(),
    scopes: PUBLIC_KAKAO_SCOPES,
  });
}
