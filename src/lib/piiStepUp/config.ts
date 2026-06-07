export const PII_UNLOCK_TTL_MS = 30 * 60 * 1000;
export const REMOTE_CHALLENGE_TTL_MS = 5 * 60 * 1000;
export const WEBAUTHN_CHALLENGE_TTL_MS = 5 * 60 * 1000;

export function getWebAuthnRpId(): string {
  const fromEnv = process.env.WEBAUTHN_RP_ID?.trim();
  if (fromEnv) return fromEnv;
  const base = process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app';
  try {
    return new URL(base).hostname;
  } catch {
    return 'pitaya-osv1.vercel.app';
  }
}

export function getWebAuthnOrigin(): string {
  return (process.env.NEXT_PUBLIC_APP_URL || 'https://pitaya-osv1.vercel.app').replace(/\/$/, '');
}

export function getAppBaseUrl(): string {
  return getWebAuthnOrigin();
}
