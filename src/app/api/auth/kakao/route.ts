import { NextResponse } from 'next/server';
import { getKakaoRedirectUri, getKakaoRestApiKey } from '@/lib/kakao/config';

export async function GET() {
  const clientId = getKakaoRestApiKey();
  if (!clientId) {
    return NextResponse.json({ error: 'KAKAO_REST_API_KEY 미설정' }, { status: 500 });
  }

  const kakaoAuthUrl = new URL('https://kauth.kakao.com/oauth/authorize');
  kakaoAuthUrl.searchParams.set('client_id', clientId);
  kakaoAuthUrl.searchParams.set('redirect_uri', getKakaoRedirectUri());
  kakaoAuthUrl.searchParams.set('response_type', 'code');
  kakaoAuthUrl.searchParams.set('scope', 'profile_nickname profile_image account_email talk_message');

  return NextResponse.redirect(kakaoAuthUrl.toString());
}
