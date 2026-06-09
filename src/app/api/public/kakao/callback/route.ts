import { NextResponse } from 'next/server';
import { getKakaoClientSecret, getKakaoRestApiKey } from '@/lib/kakao/config';
import { normalizeAgeRange, normalizeGender } from '@/lib/publicOrderIdentity';

export const dynamic = 'force-dynamic';

const COOKIE_NAME = 'pitaya_po_kakao_prefill';
const COOKIE_MAX_AGE = 600;

/** GET — 카카오 OAuth 콜백 → 성별·연령대 쿠키 후 주문 페이지로 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  const error = searchParams.get('error');
  const stateRaw = searchParams.get('state');

  let returnTo = '/';
  try {
    if (stateRaw) {
      const parsed = JSON.parse(Buffer.from(stateRaw, 'base64url').toString('utf8'));
      if (parsed.returnTo) returnTo = String(parsed.returnTo);
    }
  } catch { /* ignore */ }

  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  const failRedirect = (msg: string) =>
    NextResponse.redirect(`${base}${returnTo}${returnTo.includes('?') ? '&' : '?'}kakaoError=${encodeURIComponent(msg)}`);

  if (error || !code) {
    return failRedirect(error || '카카오 로그인 취소');
  }

  const restKey = getKakaoRestApiKey();
  const clientSecret = getKakaoClientSecret();
  if (!restKey) return failRedirect('카카오 설정 없음');

  try {
    const tokenRes = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        client_id: restKey,
        redirect_uri: `${base}/api/public/kakao/callback`,
        code,
        ...(clientSecret ? { client_secret: clientSecret } : {}),
      }),
    });
    const tokenData = await tokenRes.json();
    if (!tokenRes.ok || !tokenData.access_token) {
      return failRedirect(tokenData.error_description || '토큰 발급 실패');
    }

    const meRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });
    const me = await meRes.json();
    if (!meRes.ok) {
      return failRedirect('프로필 조회 실패');
    }

    const account = me.kakao_account || {};
    const prefill = {
      kakaoId: String(me.id || ''),
      gender: normalizeGender(account.gender),
      ageRange: normalizeAgeRange(account.age_range),
      nickname: account.profile?.nickname || '',
    };

    const res = NextResponse.redirect(`${base}${returnTo}`);
    res.cookies.set(COOKIE_NAME, JSON.stringify(prefill), {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: COOKIE_MAX_AGE,
      path: '/',
    });
    return res;
  } catch (e: unknown) {
    return failRedirect(e instanceof Error ? e.message : '카카오 처리 실패');
  }
}

/** POST — 클라이언트가 prefill 쿠키 읽기 (1회) */
export async function POST(req: Request) {
  const cookie = req.headers.get('cookie') || '';
  const match = cookie.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  if (!match) {
    return NextResponse.json({ prefill: null });
  }

  try {
    const prefill = JSON.parse(decodeURIComponent(match[1]));
    const res = NextResponse.json({ prefill });
    res.cookies.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
    return res;
  } catch {
    return NextResponse.json({ prefill: null });
  }
}
