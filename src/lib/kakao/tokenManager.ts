import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKakaoClientSecret, getKakaoRestApiKey } from './config';

const REFRESH_BUFFER_MS = 30 * 60 * 1000;

interface KakaoTokenResponse {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
  error?: string;
  error_description?: string;
}

export async function getValidKakaoToken(userId: string): Promise<string | null> {
  try {
    const userRef = adminDb.collection('users').doc(userId);
    const userSnap = await userRef.get();
    if (!userSnap.exists) return null;

    const user = userSnap.data()!;
    if (!user.kakaoAccessToken) return null;

    const now = Date.now();
    const expiry = typeof user.kakaoTokenExpiry === 'number' ? user.kakaoTokenExpiry : 0;

    if (now <= expiry - REFRESH_BUFFER_MS) {
      return user.kakaoAccessToken as string;
    }

    if (!user.kakaoRefreshToken) return user.kakaoAccessToken as string;

    const params = new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: getKakaoRestApiKey(),
      refresh_token: user.kakaoRefreshToken as string,
    });
    const clientSecret = getKakaoClientSecret();
    if (clientSecret) params.set('client_secret', clientSecret);

    const res = await fetch('https://kauth.kakao.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: params,
    });
    const data = (await res.json()) as KakaoTokenResponse;

    if (data.error || !data.access_token) {
      return user.kakaoAccessToken as string;
    }

    const updates: Record<string, unknown> = {
      kakaoAccessToken: data.access_token,
      kakaoTokenExpiry: Date.now() + (data.expires_in || 21600) * 1000,
      kakaoTokenUpdatedAt: FieldValue.serverTimestamp(),
    };
    if (data.refresh_token) {
      updates.kakaoRefreshToken = data.refresh_token;
      if (data.refresh_token_expires_in) {
        updates.kakaoRefreshTokenExpiry = Date.now() + data.refresh_token_expires_in * 1000;
      }
    }

    await userRef.update(updates);
    return data.access_token;
  } catch (e) {
    console.error('[kakao token]', e);
    return null;
  }
}
