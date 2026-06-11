'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface ProductItem {
  id: string;
  category?: string;
  cut?: string;
  buyPrice?: number;
  [key: string]: unknown;
}

export function useProducts(storeId: string, category?: string, enabled = true) {
  const qs = new URLSearchParams({ storeId });
  if (category && category !== '전체') qs.set('category', category);

  return useQuery({
    queryKey: queryKeys.products(storeId, category),
    queryFn: () => fetchAuthJson<{ items: ProductItem[] }>(`/api/items?${qs.toString()}`),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.products,
    select: data => data.items ?? [],
  });
}
