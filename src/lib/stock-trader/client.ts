/** stock-trader-android/server 프록시 (서버 전용) */

export function getStockTraderConfig() {
  const baseUrl = (process.env.STOCK_TRADER_API_URL || 'http://localhost:8787').replace(/\/$/, '');
  const token = process.env.STOCK_TRADER_API_TOKEN?.trim() || '';
  return { baseUrl, token, configured: !!token };
}

export async function stockTraderFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
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
