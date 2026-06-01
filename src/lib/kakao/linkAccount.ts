import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

interface KakaoTokenPayload {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  refresh_token_expires_in?: number;
}

interface KakaoProfile {
  id: number;
  kakao_account?: {
    email?: string;
    profile?: {
      nickname?: string;
      profile_image_url?: string;
    };
  };
}

export async function linkKakaoToUser(uid: string, tokens: KakaoTokenPayload, kakaoUser: KakaoProfile) {
  const kakaoId = String(kakaoUser.id);

  const dupSnap = await adminDb.collection('users')
    .where('kakaoId', '==', kakaoId)
    .limit(2)
    .get();

  for (const doc of dupSnap.docs) {
    if (doc.id !== uid) {
      throw new Error('already_linked');
    }
  }

  const kakaoEmail = kakaoUser.kakao_account?.email || '';
  const kakaoNickname = kakaoUser.kakao_account?.profile?.nickname || '';

  await adminDb.collection('users').doc(uid).set({
    kakaoId,
    kakaoEmail,
    kakaoNickname,
    kakaoAccessToken: tokens.access_token,
    kakaoRefreshToken: tokens.refresh_token || '',
    kakaoTokenExpiry: Date.now() + (tokens.expires_in || 21600) * 1000,
    kakaoRefreshTokenExpiry: tokens.refresh_token_expires_in
      ? Date.now() + tokens.refresh_token_expires_in * 1000
      : null,
    kakaoLinkedAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { kakaoId, kakaoEmail, kakaoNickname };
}

export async function unlinkKakaoFromUser(uid: string) {
  await adminDb.collection('users').doc(uid).update({
    kakaoId: FieldValue.delete(),
    kakaoEmail: FieldValue.delete(),
    kakaoNickname: FieldValue.delete(),
    kakaoAccessToken: FieldValue.delete(),
    kakaoRefreshToken: FieldValue.delete(),
    kakaoTokenExpiry: FieldValue.delete(),
    kakaoRefreshTokenExpiry: FieldValue.delete(),
    kakaoLinkedAt: FieldValue.delete(),
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export function sanitizeUserForClient(data: Record<string, unknown>) {
  const {
    kakaoAccessToken: _a,
    kakaoRefreshToken: _r,
    kakaoTokenExpiry: _e,
    kakaoRefreshTokenExpiry: _re,
    ...safe
  } = data;
  return {
    ...safe,
    kakaoLinked: Boolean(data.kakaoId && data.kakaoAccessToken),
  };
}
