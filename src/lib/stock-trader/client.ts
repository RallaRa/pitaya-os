/** stock-trader-android/server 프록시 또는 Vercel 내장 KIS */

import { isKisDirectConfigured } from '@/lib/stock/kisConfig.server';

function isLocalhostUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.hostname === 'localhost' || u.hostname === '127.0.0.1';
  } catch {
    return true;
  }
}

/** Vercel·로컬 localhost — 외부 8787 서버 대신 Pitaya 내장 KIS 사용 */
export function shouldUseLocalKis(): boolean {
  if (!isKisDirectConfigured()) return false;
  if (process.env.VERCEL === '1') return true;
  const baseUrl = (process.env.STOCK_TRADER_API_URL || 'http://localhost:8787').replace(/\/$/, '');
  if (isLocalhostUrl(baseUrl)) return true;
  const token = process.env.STOCK_TRADER_API_TOKEN?.trim();
  if (!token) return true;
  return false;
}

export function getStockTraderConfig() {
  const baseUrl = (process.env.STOCK_TRADER_API_URL || 'http://localhost:8787').replace(/\/$/, '');
  const token = process.env.STOCK_TRADER_API_TOKEN?.trim() || '';
  const direct = isKisDirectConfigured();
  const local = shouldUseLocalKis();
  return {
    baseUrl,
    token,
    direct,
    local,
    configured: !!token || direct,
    mode: local ? ('direct' as const) : ('proxy' as const),
  };
}

export async function stockTraderFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  if (shouldUseLocalKis()) {
    const { handleLocalStockTraderApi } = await import('@/lib/stock-trader/localApi.server');
    const clean = path.replace(/^\//, '').replace(/^api\//, '');
    const method = init.method || 'GET';
    const localReq = new Request(`http://local/${clean}`, {
      method,
      headers: init.headers,
      body: init.body ?? undefined,
    });
    return handleLocalStockTraderApi(clean, localReq, method) as Promise<T>;
  }

  const { baseUrl, token, configured } = getStockTraderConfig();
  if (!configured) {
    throw new Error('STOCK_TRADER_API_TOKEN 미설정 (Vercel/로컬 env)');
  }

  const url = `${baseUrl}${path.startsWith('/') ? path : `/${path}`}`;
  const headers = new Headers(init.headers);
  headers.set('x-api-token', token);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }

  const res = await fetch(url, { ...init, headers, cache: 'no-store' });
  const text = await res.text();
  let data: T & { error?: string };
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    throw new Error(text.slice(0, 200) || res.statusText);
  }

  if (!res.ok) {
    throw new Error((data as { error?: string }).error || res.statusText);
  }
  return data;
}
