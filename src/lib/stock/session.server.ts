import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS, STOCK_SESSION_IDLE_MS } from '@/lib/stock/constants';
import { randomUUID } from 'crypto';

export async function createStockSession(uid: string): Promise<string> {
  const sessionId = randomUUID();
  await adminDb.collection(STOCK_COLLECTIONS.sessions).doc(uid).set({
    sessionId,
    lastActiveAt: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    revoked: false,
  });
  return sessionId;
}

export async function validateStockSession(
  uid: string,
  sessionId?: string,
): Promise<{ ok: true; sessionId: string } | { ok: false; reason: string }> {
  const ref = adminDb.collection(STOCK_COLLECTIONS.sessions).doc(uid);
  const snap = await ref.get();
  if (!snap.exists) {
    const id = await createStockSession(uid);
    return { ok: true, sessionId: id };
  }

  const data = snap.data()!;
  if (data.revoked) return { ok: false, reason: 'SESSION_REVOKED' };

  const last = data.lastActiveAt?.toDate?.()?.getTime?.() || 0;
  if (Date.now() - last > STOCK_SESSION_IDLE_MS) {
    await ref.update({ revoked: true });
    return { ok: false, reason: 'SESSION_IDLE_TIMEOUT' };
  }

  if (sessionId && data.sessionId !== sessionId) {
    return { ok: false, reason: 'SESSION_CONFLICT' };
  }

  return { ok: true, sessionId: data.sessionId as string };
}

export async function touchStockSession(uid: string, sessionId: string) {
  await adminDb.collection(STOCK_COLLECTIONS.sessions).doc(uid).set({
    sessionId,
    lastActiveAt: FieldValue.serverTimestamp(),
    revoked: false,
  }, { merge: true });
}

export async function revokeOtherSessions(uid: string, keepSessionId: string) {
  await adminDb.collection(STOCK_COLLECTIONS.sessions).doc(uid).set({
    sessionId: keepSessionId,
    lastActiveAt: FieldValue.serverTimestamp(),
    revoked: false,
  });
}
