import { onAuthStateChanged, User } from 'firebase/auth';
import { auth as firebaseAuth } from '@/lib/firebase/firebase';

/** 만료 5분 전부터 토큰 재발급 */
const TOKEN_REFRESH_BUFFER_MS = 5 * 60 * 1000;
const WAIT_FOR_USER_MS = 5000;

let waitForUserPromise: Promise<User | null> | null = null;
let tokenFetchPromise: Promise<Record<string, string>> | null = null;
let cachedHeaders: Record<string, string> | null = null;
let cachedTokenExpMs = 0;
let authListenerAttached = false;

function parseJwtExpMs(token: string): number {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' ? payload.exp * 1000 : 0;
  } catch {
    return 0;
  }
}

function clearAuthHeadersCache() {
  cachedHeaders = null;
  cachedTokenExpMs = 0;
  tokenFetchPromise = null;
  waitForUserPromise = null;
}

function ensureAuthListener() {
  if (authListenerAttached) return;
  authListenerAttached = true;
  onAuthStateChanged(firebaseAuth, () => {
    clearAuthHeadersCache();
  });
}

function waitForUser(timeoutMs = WAIT_FOR_USER_MS): Promise<User | null> {
  ensureAuthListener();
  const auth = firebaseAuth;
  if (auth.currentUser) return Promise.resolve(auth.currentUser);

  if (!waitForUserPromise) {
    waitForUserPromise = new Promise(resolve => {
      const timer = setTimeout(() => {
        unsub();
        waitForUserPromise = null;
        resolve(auth.currentUser);
      }, timeoutMs);

      const unsub = onAuthStateChanged(auth, user => {
        clearTimeout(timer);
        unsub();
        waitForUserPromise = null;
        resolve(user);
      });
    });
  }

  return waitForUserPromise;
}

async function resolveAuthHeaders(forceRefresh = false): Promise<Record<string, string>> {
  const user = await waitForUser();
  if (!user) {
    cachedHeaders = {};
    cachedTokenExpMs = 0;
    return {};
  }

  const now = Date.now();
  if (!forceRefresh && cachedHeaders && cachedTokenExpMs - TOKEN_REFRESH_BUFFER_MS > now) {
    return cachedHeaders;
  }

  try {
    const token = await user.getIdToken(forceRefresh);
    const expMs = parseJwtExpMs(token);
    cachedHeaders = { Authorization: `Bearer ${token}` };
    cachedTokenExpMs = expMs || now + 55 * 60 * 1000;
    return cachedHeaders;
  } catch {
    cachedHeaders = {};
    cachedTokenExpMs = 0;
    return {};
  }
}

/**
 * 현재 로그인된 Firebase 사용자의 ID Token을 포함한 헤더를 반환합니다.
 * 동시 호출은 하나의 in-flight 요청·캐시된 토큰을 공유합니다.
 */
export async function getAuthHeaders(options?: { forceRefresh?: boolean }): Promise<Record<string, string>> {
  ensureAuthListener();

  if (options?.forceRefresh) {
    clearAuthHeadersCache();
    return resolveAuthHeaders(true);
  }

  const now = Date.now();
  if (cachedHeaders && cachedTokenExpMs - TOKEN_REFRESH_BUFFER_MS > now) {
    return cachedHeaders;
  }

  if (!tokenFetchPromise) {
    tokenFetchPromise = resolveAuthHeaders().finally(() => {
      tokenFetchPromise = null;
    });
  }

  return tokenFetchPromise;
}

export async function getAuthJsonHeaders(options?: { forceRefresh?: boolean }): Promise<Record<string, string>> {
  const base = await getAuthHeaders(options);
  return { ...base, 'Content-Type': 'application/json' };
}

/** 로그아웃 등에서 명시적으로 캐시를 비울 때 사용 */
export function invalidateAuthHeadersCache(): void {
  clearAuthHeadersCache();
}
