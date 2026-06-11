import { getAuthHeaders } from '@/lib/getAuthHeaders';

export async function fetchAuthJson<T>(url: string, init?: RequestInit): Promise<T> {
  const headers = await getAuthHeaders();
  const res = await fetch(url, {
    ...init,
    headers: {
      ...headers,
      ...(init?.headers ?? {}),
    },
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(typeof data?.error === 'string' ? data.error : `HTTP ${res.status}`);
  }
  return data as T;
}
