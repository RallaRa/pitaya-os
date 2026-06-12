'use client';

import { useCallback, useState } from 'react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

export function useStockTraderApi() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const call = useCallback(async <T,>(path: string, init?: RequestInit): Promise<T> => {
    setLoading(true);
    setError(null);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch(`/api/stock-trader/${path.replace(/^\//, '')}`, {
        ...init,
        headers: { ...headers, ...(init?.headers || {}) },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      return data as T;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      throw e;
    } finally {
      setLoading(false);
    }
  }, []);

  return { call, loading, error, setError };
}
