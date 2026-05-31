import { NextResponse } from 'next/server';
import { adminAuth, adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  getKakaoClientSecret,
  getKakaoRedirectUri,
  getKakaoRestApiKey,
} from '@/lib/kakao/config';

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const code = searchParams.get('code');
  if (!code) {
    return NextResponse.redirect(`${BASE_URL}/login?error=kakao_failed`);
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
      return NextResponse.redirect(`${BASE_URL}/login?error=kakao_failed`);
    }

    const userRes = await fetch('https://kapi.kakao.com/v2/user/me', {
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    });
    const kakaoUser = await userRes.json();

    const kakaoId = String(kakaoUser.id);
    const email = kakaoUser.kakao_account?.email || `kakao_${kakaoId}@pitaya.app`;
    const nickname = kakaoUser.kakao_account?.profile?.nickname || '사용자';
    const profileImage = kakaoUser.kakao_account?.profile?.profile_image_url || '';

    const uid = `kakao_${kakaoId}`;
    try {
      await adminAuth.getUser(uid);
      await adminAuth.updateUser(uid, {
        email,
        displayName: nickname,
        photoURL: profileImage || undefined,
      });
    } catch {
      await adminAuth.createUser({
        uid,
        email,
        displayName: nickname,
        photoURL: profileImage || undefined,
      });
    }

    const customToken = await adminAuth.createCustomToken(uid);

    await adminDb.collection('users').doc(uid).set({
      uid,
      email,
      name: nickname,
      nickname,
      photoURL: profileImage,
      profileImage,
      kakaoId,
      kakaoAccessToken: tokens.access_token,
      kakaoRefreshToken: tokens.refresh_token || '',
      kakaoTokenExpiry: Date.now() + (tokens.expires_in || 21600) * 1000,
      kakaoRefreshTokenExpiry: tokens.refresh_token_expires_in
        ? Date.now() + tokens.refresh_token_expires_in * 1000
        : null,
      authProvider: 'kakao',
      updatedAt: FieldValue.serverTimestamp(),
      createdAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    const redirectUrl = new URL('/auth/kakao-complete', BASE_URL);
    redirectUrl.searchParams.set('token', customToken);
    return NextResponse.redirect(redirectUrl.toString());
  } catch (e) {
    console.error('[kakao callback]', e);
    return NextResponse.redirect(`${BASE_URL}/login?error=kakao_failed`);
  }
}
