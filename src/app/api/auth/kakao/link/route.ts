import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { getKakaoAuthScopes, getKakaoRedirectUri, getKakaoRestApiKey } from '@/lib/kakao/config';
import { createKakaoOAuthState } from '@/lib/kakao/oauthState';
import { unlinkKakaoFromUser } from '@/lib/kakao/linkAccount';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  if (authUser.uid.startsWith('kakao_')) {
    return NextResponse.json({
      error: '카카오 전용 계정은 지원하지 않습니다. Google 계정으로 가입 후 카카오를 연동해주세요.',
    }, { status: 400 });
  }

  const clientId = getKakaoRestApiKey();
  if (!clientId) {
    return NextResponse.json({ error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
  }

  const state = await createKakaoOAuthState(authUser.uid);
  const kakaoAuthUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  kakaoAuthUrl.searchParams.set('client_id', clientId);
  kakaoAuthUrl.searchParams.set('redirect_uri', getKakaoRedirectUri());
  kakaoAuthUrl.searchParams.set('response_type', 'code');
  kakaoAuthUrl.searchParams.set('scope', getKakaoAuthScopes());
  kakaoAuthUrl.searchParams.set('state', state);

  return NextResponse.json({ url: kakaoAuthUrl.toString() });
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) {
    return NextResponse.json({ error: '로그인이 필요합니다.' }, { status: 401 });
  }

  await unlinkKakaoFromUser(authUser.uid);
  return NextResponse.json({ success: true });
}
