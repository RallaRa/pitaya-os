import { NextResponse } from 'next/server';
import { KAKAO_APP_BASE_URL } from '@/lib/kakao/config';

/** 카카오 단독 로그인 비활성 — Google 가입 후 설정에서 연동 */
export async function GET() {
  const url = new URL('/login', KAKAO_APP_BASE_URL);
  url.searchParams.set('kakao_error', 'login_disabled');
  return NextResponse.redirect(url.toString());
}
