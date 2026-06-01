import { NextResponse } from 'next/server';
import {
  getKakaoClientSecret,
  getKakaoRedirectUri,
  getKakaoRestApiKey,
  KAKAO_APP_BASE_URL,
} from '@/lib/kakao/config';
import { consumeKakaoOAuthState } from '@/lib/kakao/oauthState';
import { linkKakaoToUser } from '@/lib/kakao/linkAccount';

function redirectWithError(code: string) {
  return NextResponse.redirect(`${KAKAO_APP_BASE_URL}/dashboard/settings/account?kakao_error=${code}`);
}

function redirectWithSuccess() {
  return NextResponse.redirect(`${KAKAO_APP_BASE_URL}/dashboard/settings/account?kakao=linked`);
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const state = searchParams.get('state');
  const kakaoError = searchParams.get('error');

  if (kakaoError) {
    return redirectWithError('denied');
  }
  if (!code || !state) {
    return redirectWithError('invalid_request');
  }

  const uid = await consumeKakaoOAuthState(state);
  if (!uid) {
    return redirectWithError('invalid_state');
  }

  try {
    const tokenParams = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: getKakaoRestApiKey(),
      client_secret: getKakaoClientSecret(),
      redirect_uri: getKakaoRedirectUri(),
      code,
    });

    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: tokenParams,
    });
    const tokens = await tokenRes.json();

    if (!tokenRes.ok || !tokens.access_token) {
      console.error('[kakao callback] token error', tokens);
      return redirectWithError('token_failed');
    }

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const kakaoUser = await userRes.json();

    if (!userRes.ok || !kakaoUser.id) {
      return redirectWithError('profile_failed');
    }

    await linkKakaoToUser(uid, tokens, kakaoUser);
    return redirectWithSuccess();
  } catch (e) {
    const msg = e instanceof Error ? e.message : '';
    if (msg === 'already_linked') {
      return redirectWithError('already_linked');
    }
    console.error('[kakao callback]', e);
    return redirectWithError('failed');
  }
}
