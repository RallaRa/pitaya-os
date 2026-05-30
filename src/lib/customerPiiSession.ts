export interface DecryptedCustomer {
  cusCode: string;
  name: string;
  phone: string;
  birth: string;
}

export interface CustomerPiiSession {
  uid: string;
  storeId: string;
  decryptedMap: Record<string, DecryptedCustomer>;
  decryptedRows?: Record<string, unknown>[];
  unlockedAt: number;
}

const STORAGE_KEY = 'pitaya_customer_pii_session';

export function loadCustomerPiiSession(uid: string, storeId: string): CustomerPiiSession | null {
  if (typeof window === 'undefined' || !uid || !storeId) return null;
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as CustomerPiiSession;
    if (data.uid !== uid || data.storeId !== storeId) return null;
    return data;
  } catch {
    return null;
  }
}

export function saveCustomerPiiSession(session: CustomerPiiSession): void {
  if (typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(session));
  } catch {
    /* quota exceeded 등 — 메모리 상태만 유지 */
  }
}

export function clearCustomerPiiSession(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(STORAGE_KEY);
}

export function mergeDecryptedMaps(
  existing: Record<string, DecryptedCustomer>,
  incoming: Record<string, DecryptedCustomer>,
): Record<string, DecryptedCustomer> {
  return { ...existing, ...incoming };
}

export function mergeDecryptedRows(
  existing: Record<string, unknown>[],
  incoming: Record<string, unknown>[],
): Record<string, unknown>[] {
  const byCode = new Map<string, Record<string, unknown>>();
  existing.forEach(r => byCode.set(String(r.cusCode || ''), r));
  incoming.forEach(r => byCode.set(String(r.cusCode || ''), r));
  return Array.from(byCode.values());
}
