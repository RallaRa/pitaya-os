export function getKakaoRestApiKey() {
  return process.env.KAKAO_REST_API_KEY || '';
}

export function getKakaoClientSecret() {
  return process.env.KAKAO_CLIENT_SECRET || '';
}

export function getKakaoRedirectUri() {
  return process.env.KAKAO_REDIRECT_URI
    || `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/api/auth/kakao/callback`;
}

export function getKakaoJsKey() {
  return process.env.NEXT_PUBLIC_KAKAO_JS_KEY || '';
}

/** 나에게 보내기: talk_message 필수. account_email은 알림에 불필요 */
export const KAKAO_AUTH_SCOPES = [
  'profile_nickname',
  'talk_message',
].join(',');

export function getKakaoAuthScopes() {
  return KAKAO_AUTH_SCOPES;
}

export const KAKAO_APP_BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
