/** 홈택스 세션(쿠키) 연동 — 비밀번호·인증서 파일은 저장하지 않음 */

export interface HometaxCookie {
  name: string;
  value: string;
  domain?: string;
  path?: string;
}

export interface HometaxSessionRecord {
  storeId: string;
  cookieJarEncrypted: string;
  cookieCount: number;
  linkedAt?: unknown;
  linkedBy?: string;
  linkMethod?: 'manual' | 'extension';
  lastVerifiedAt?: unknown;
  lastSyncAt?: unknown;
  lastSyncStatus?: 'ok' | 'expired' | 'error' | 'pending';
  lastSyncMessage?: string;
  lastSyncImported?: number;
  autoSyncEnabled?: boolean;
  syncLookbackDays?: number;
  lastExpiryNotifiedAt?: unknown;
  expiresAt?: unknown;
  updatedAt?: unknown;
}

export interface HometaxSessionStatus {
  connected: boolean;
  cookieCount: number;
  linkedAt: string | null;
  lastVerifiedAt: string | null;
  lastSyncAt: string | null;
  lastSyncStatus: string | null;
  lastSyncMessage: string | null;
  lastSyncImported: number;
  autoSyncEnabled: boolean;
  syncLookbackDays: number;
  sessionValid: boolean | null;
}

export interface HometaxSyncResult {
  ok: boolean;
  sessionValid: boolean;
  message: string;
  imported: {
    tax_invoice: number;
    cash_receipt: number;
    card: number;
    total: number;
  };
  skipped: {
    tax_invoice: number;
    cash_receipt: number;
    card: number;
    total: number;
  };
  errors: string[];
}

export function parseCookieInput(raw: unknown): HometaxCookie[] {
  if (!raw) return [];

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (!trimmed) return [];
    try {
      return normalizeCookieList(JSON.parse(trimmed));
    } catch {
      return parseDocumentCookieString(trimmed);
    }
  }

  if (Array.isArray(raw)) {
    return normalizeCookieList(raw);
  }

  return [];
}

function normalizeCookieList(list: unknown[]): HometaxCookie[] {
  const out: HometaxCookie[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name || '').trim();
    const value = String(row.value ?? '').trim();
    if (!name) continue;
    out.push({
      name,
      value,
      domain: String(row.domain || '.hometax.go.kr').trim(),
      path: String(row.path || '/').trim(),
    });
  }
  return out;
}

/** DevTools Application → Cookies 복사 또는 name=value; 형태 */
function parseDocumentCookieString(text: string): HometaxCookie[] {
  const out: HometaxCookie[] = [];
  for (const part of text.split(';')) {
    const idx = part.indexOf('=');
    if (idx <= 0) continue;
    const name = part.slice(0, idx).trim();
    const value = part.slice(idx + 1).trim();
    if (name) out.push({ name, value, domain: '.hometax.go.kr', path: '/' });
  }
  return out;
}

export function buildCookieHeader(cookies: HometaxCookie[]): string {
  return cookies.map(c => `${c.name}=${c.value}`).join('; ');
}
