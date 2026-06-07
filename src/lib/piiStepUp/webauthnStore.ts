import { adminDb } from '@/lib/firebase/admin';

export interface StoredWebAuthnCredential {
  credentialId: string;
  publicKey: string;
  counter: number;
  transports?: string[];
  createdAt: number;
}

const CHALLENGE_COLLECTION = 'webauthn_challenges';
const CREDENTIAL_COLLECTION = 'user_webauthn_credentials';

export async function saveWebAuthnChallenge(
  uid: string,
  challenge: string,
  type: 'registration' | 'authentication',
): Promise<void> {
  await adminDb.collection(CHALLENGE_COLLECTION).doc(uid).set({
    challenge,
    type,
    expiresAt: Date.now() + 5 * 60 * 1000,
  });
}

export async function consumeWebAuthnChallenge(
  uid: string,
  expectedType: 'registration' | 'authentication',
): Promise<string | null> {
  const ref = adminDb.collection(CHALLENGE_COLLECTION).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) return null;
  const data = snap.data();
  await ref.delete().catch(() => {});

  if (!data?.challenge || data.type !== expectedType) return null;
  if (typeof data.expiresAt === 'number' && data.expiresAt < Date.now()) return null;
  return String(data.challenge);
}

export async function listUserWebAuthnCredentials(uid: string): Promise<StoredWebAuthnCredential[]> {
  const snap = await adminDb.collection(CREDENTIAL_COLLECTION)
    .where('uid', '==', uid)
    .get();
  return snap.docs.map(d => d.data() as StoredWebAuthnCredential);
}

export async function getWebAuthnCredentialById(
  uid: string,
  credentialId: string,
): Promise<(StoredWebAuthnCredential & { docId: string }) | null> {
  const snap = await adminDb.collection(CREDENTIAL_COLLECTION)
    .where('uid', '==', uid)
    .where('credentialId', '==', credentialId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { ...(doc.data() as StoredWebAuthnCredential), docId: doc.id };
}

export async function saveWebAuthnCredential(
  uid: string,
  cred: StoredWebAuthnCredential,
): Promise<void> {
  await adminDb.collection(CREDENTIAL_COLLECTION).add({
    uid,
    ...cred,
  });
}

export async function updateWebAuthnCounter(docId: string, counter: number): Promise<void> {
  await adminDb.collection(CREDENTIAL_COLLECTION).doc(docId).update({ counter });
}

export async function userHasWebAuthnCredential(uid: string): Promise<boolean> {
  const snap = await adminDb.collection(CREDENTIAL_COLLECTION)
    .where('uid', '==', uid)
    .limit(1)
    .get();
  return !snap.empty;
}
