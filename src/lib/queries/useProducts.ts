'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface ProductItem {
  id: string;
  category?: string;
  grade?: string;
  targetMargin?: number;
  appliedCost?: number;
  lossRate?: number;
  species?: string;
  storage?: string;
  cut?: string;
  origin?: string;
  buyPrice?: number;
  sellPrice?: number;
  kgTargetPrice?: number;
  kgSalePrice?: number;
  geunTargetPrice?: number;
  geunSalePrice?: number;
  supplier?: string;
  lastPurchaseDate?: string;
  lastTrace?: string;
  priceHistory?: { date: string; oldPrice: number; newPrice: number }[];
}

function productsQueryKey(storeId: string, category?: string) {
  return queryKeys.products(storeId, category ?? 'all');
}

export function useProducts(storeId: string, category?: string, enabled = true) {
  const qs = new URLSearchParams({ storeId });
  if (category && category !== '전체') qs.set('category', category);

  return useQuery({
    queryKey: productsQueryKey(storeId, category),
    queryFn: () => fetchAuthJson<{ items: ProductItem[] }>(`/api/items?${qs.toString()}`),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.products,
    select: data => data.items ?? [],
  });
}

export function useUpdateProduct(storeId: string, category?: string) {
  const queryClient = useQueryClient();
  const key = productsQueryKey(storeId, category);

  return useMutation({
    mutationFn: ({ id, updates }: { id: string; updates: Partial<ProductItem> }) =>
      fetchAuthJson<Partial<ProductItem>>('/api/items', {
        method: 'PUT',
        body: JSON.stringify({ id, updates }),
      }),
    onMutate: async ({ id, updates }) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<{ items: ProductItem[] }>(key);
      queryClient.setQueryData<{ items: ProductItem[] }>(
        key,
        old => ({
          items: old?.items?.map(item => (item.id === id ? { ...item, ...updates } : item)) ?? [],
        }),
      );
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
    },
  });
}

export function useDeleteProduct(storeId: string, category?: string) {
  const queryClient = useQueryClient();
  const key = productsQueryKey(storeId, category);

  return useMutation({
    mutationFn: (id: string) =>
      fetchAuthJson(`/api/items?id=${encodeURIComponent(id)}`, { method: 'DELETE' }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: key });
      const prev = queryClient.getQueryData<{ items: ProductItem[] }>(key);
      queryClient.setQueryData<{ items: ProductItem[] }>(
        key,
        old => ({ items: old?.items?.filter(item => item.id !== id) ?? [] }),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(key, ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
    },
  });
}

export function useCreateProduct(storeId: string, category?: string) {
  const queryClient = useQueryClient();
  const key = productsQueryKey(storeId, category);

  return useMutation({
    mutationFn: (item: Partial<ProductItem>) =>
      fetchAuthJson<{ id: string }>('/api/items', {
        method: 'POST',
        body: JSON.stringify({ storeId, item }),
      }),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['products', storeId] });
    },
    onSuccess: (data, item) => {
      queryClient.setQueryData<{ items: ProductItem[] }>(key, old => ({
        items: [...(old?.items ?? []), { id: data.id, ...item } as ProductItem],
      }));
    },
  });
}
