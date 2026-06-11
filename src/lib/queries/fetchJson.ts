import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export class QueryFetchError extends Error {
  constructor(message: string, readonly status?: number) {
    super(message);
    this.name = 'QueryFetchError';
  }
}

export async function fetchAuthJson<T>(url: string, init?: RequestInit): Promise<T> {
  const isWrite = init?.method && init.method !== 'GET' && init.method !== 'HEAD';
  const headers = isWrite ? await getAuthJsonHeaders() : await getAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: { ...headers, ...(init?.headers as Record<string, string> | undefined) },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new QueryFetchError(
      typeof data.error === 'string' ? data.error : `요청 실패 (${res.status})`,
      res.status,
    );
  }
  return data as T;
}
