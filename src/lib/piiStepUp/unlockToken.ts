import { createHmac, timingSafeEqual } from 'crypto';
import { PII_UNLOCK_TTL_MS } from './config';

interface UnlockPayload {
  uid: string;
  storeId: string;
  exp: number;
  nonce: string;
}

function signingKey(): string {
  const key = process.env.ENCRYPTION_KEY || process.env.CRON_SECRET || 'pitaya-pii-step-up';
  return key;
}

function encodePayload(payload: UnlockPayload): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function decodePayload(encoded: string): UnlockPayload | null {
  try {
    return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as UnlockPayload;
  } catch {
    return null;
  }
}

export function createPiiUnlockToken(uid: string, storeId: string): { token: string; expiresAt: number } {
  const expiresAt = Date.now() + PII_UNLOCK_TTL_MS;
  const payload: UnlockPayload = {
    uid,
    storeId,
    exp: expiresAt,
    nonce: crypto.randomUUID(),
  };
  const encoded = encodePayload(payload);
  const sig = createHmac('sha256', signingKey()).update(encoded).digest('base64url');
  return { token: `${encoded}.${sig}`, expiresAt };
}

export function verifyPiiUnlockToken(
  token: string | null | undefined,
  uid: string,
  storeId: string,
): boolean {
  if (!token || !uid || !storeId) return false;
  const [encoded, sig] = token.split('.');
  if (!encoded || !sig) return false;

  const expected = createHmac('sha256', signingKey()).update(encoded).digest('base64url');
  try {
    if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) return false;
  } catch {
    return false;
  }

  const payload = decodePayload(encoded);
  if (!payload) return false;
  if (payload.uid !== uid || payload.storeId !== storeId) return false;
  if (payload.exp < Date.now()) return false;
  return true;
}
