import { randomBytes } from 'crypto';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

const COLLECTION = 'kakao_oauth_state';
const TTL_MS = 10 * 60 * 1000;

export async function createKakaoOAuthState(uid: string): Promise<string> {
  const state = randomBytes(24).toString('hex');
  await adminDb.collection(COLLECTION).doc(state).set({
    uid,
    mode: 'link',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt: Date.now() + TTL_MS,
  });
  return state;
}

export async function consumeKakaoOAuthState(state: string): Promise<string | null> {
  if (!state) return null;

  const ref = adminDb.collection(COLLECTION).doc(state);
  const snap = await ref.get();
  if (!snap.exists) return null;

  const data = snap.data()!;
  await ref.delete().catch(() => {});

  const expiresAt = typeof data.expiresAt === 'number' ? data.expiresAt : 0;
  if (Date.now() > expiresAt) return null;
  if (data.mode !== 'link' || !data.uid) return null;

  return data.uid as string;
}
