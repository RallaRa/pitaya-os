const TOKEN_KEY = 'pitaya_pii_unlock_token';

export interface PiiUnlockTokenSession {
  token: string;
  uid: string;
  storeId: string;
  expiresAt: number;
}

export function loadPiiUnlockToken(uid: string, storeId: string): string | null {
  if (typeof window === 'undefined' || !uid || !storeId) return null;
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as PiiUnlockTokenSession;
    if (data.uid !== uid || data.storeId !== storeId) return null;
    if (data.expiresAt < Date.now()) {
      sessionStorage.removeItem(TOKEN_KEY);
      return null;
    }
    return data.token;
  } catch {
    return null;
  }
}

export function savePiiUnlockToken(session: PiiUnlockTokenSession): void {
  if (typeof window === 'undefined') return;
  sessionStorage.setItem(TOKEN_KEY, JSON.stringify(session));
}

export function clearPiiUnlockToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(TOKEN_KEY);
}

export function isPiiUnlockTokenValid(uid: string, storeId: string): boolean {
  return !!loadPiiUnlockToken(uid, storeId);
}
