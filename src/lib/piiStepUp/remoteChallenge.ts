import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { notifyUser } from '@/lib/notifications/notifyUser';
import { getAppBaseUrl, REMOTE_CHALLENGE_TTL_MS } from './config';
import { createPiiUnlockToken } from './unlockToken';

export type RemoteChallengeStatus = 'pending' | 'approved' | 'expired' | 'denied';

export interface RemoteChallengeDoc {
  uid: string;
  storeId: string;
  storeName?: string;
  deviceLabel?: string;
  status: RemoteChallengeStatus;
  unlockToken?: string;
  unlockExpiresAt?: number;
  createdAt: unknown;
  expiresAt: number;
  approvedAt?: number;
}

const COLLECTION = 'pii_step_up_challenges';

export async function createRemoteChallenge(opts: {
  uid: string;
  storeId: string;
  storeName?: string;
  deviceLabel?: string;
  userName?: string;
}): Promise<{ challengeId: string; expiresAt: number }> {
  const expiresAt = Date.now() + REMOTE_CHALLENGE_TTL_MS;
  const ref = await adminDb.collection(COLLECTION).add({
    uid: opts.uid,
    storeId: opts.storeId,
    storeName: opts.storeName || '',
    deviceLabel: opts.deviceLabel || 'PC 브라우저',
    status: 'pending',
    createdAt: FieldValue.serverTimestamp(),
    expiresAt,
  } satisfies Omit<RemoteChallengeDoc, 'createdAt'> & { createdAt: FieldValue });

  const approvePath = `/dashboard/customers/pii-approve?challenge=${ref.id}`;
  const title = '고객정보 복호화 승인 요청';
  const message = `${opts.storeName || '매장'} · ${opts.deviceLabel || 'PC'}에서 개인정보 열람을 요청했습니다. 휴대폰에서 지문으로 승인하세요.`;

  await notifyUser(opts.uid, {
    title,
    message,
    link: approvePath,
    type: 'pii_unlock_request',
    storeId: opts.storeId,
    buttonTitle: '지문으로 승인',
  });

  return { challengeId: ref.id, expiresAt };
}

export async function getRemoteChallenge(challengeId: string) {
  const snap = await adminDb.collection(COLLECTION).doc(challengeId).get();
  if (!snap.exists) return null;
  const data = snap.data() as RemoteChallengeDoc;
  if (data.expiresAt < Date.now() && data.status === 'pending') {
    await snap.ref.update({ status: 'expired' });
    return { id: snap.id, ...data, status: 'expired' as const };
  }
  return { id: snap.id, ...data };
}

export async function approveRemoteChallenge(
  challengeId: string,
  uid: string,
): Promise<{ unlockToken: string; expiresAt: number } | null> {
  const snap = await adminDb.collection(COLLECTION).doc(challengeId).get();
  if (!snap.exists) return null;
  const data = snap.data() as RemoteChallengeDoc;
  if (data.uid !== uid) return null;
  if (data.status !== 'pending') return null;
  if (data.expiresAt < Date.now()) {
    await snap.ref.update({ status: 'expired' });
    return null;
  }

  const { token, expiresAt } = createPiiUnlockToken(uid, data.storeId);
  await snap.ref.update({
    status: 'approved',
    unlockToken: token,
    unlockExpiresAt: expiresAt,
    approvedAt: Date.now(),
  });

  return { unlockToken: token, expiresAt };
}

export async function denyRemoteChallenge(challengeId: string, uid: string): Promise<boolean> {
  const snap = await adminDb.collection(COLLECTION).doc(challengeId).get();
  if (!snap.exists) return false;
  const data = snap.data() as RemoteChallengeDoc;
  if (data.uid !== uid || data.status !== 'pending') return false;
  await snap.ref.update({ status: 'denied' });
  return true;
}
