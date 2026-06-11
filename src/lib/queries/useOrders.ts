'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface OrderTemplate {
  id: string;
  name: string;
  supplierName?: string;
  lines?: { itemName: string; qty: number; unit: string }[];
  active?: boolean;
}

export function useOrders(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.orders(storeId),
    queryFn: () =>
      fetchAuthJson<{ templates: OrderTemplate[] }>(
        `/api/order-templates?storeId=${encodeURIComponent(storeId)}`,
      ),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.orders,
    select: data => data.templates ?? [],
  });
}

export function useCreateOrderTemplate(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      name: string;
      supplierName?: string;
      lines?: { itemName: string; qty: number; unit: string }[];
    }) =>
      fetchAuthJson<{ id: string }>('/api/order-templates', {
        method: 'POST',
        body: JSON.stringify({ storeId, supplierId: '', ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.orders(storeId) });
      const prev = queryClient.getQueryData<{ templates: OrderTemplate[] }>(queryKeys.orders(storeId));
      const optimistic: OrderTemplate = {
        id: `temp-${Date.now()}`,
        name: body.name,
        supplierName: body.supplierName,
        lines: body.lines,
        active: true,
      };
      queryClient.setQueryData<{ templates: OrderTemplate[] }>(queryKeys.orders(storeId), old => ({
        templates: [optimistic, ...(old?.templates ?? [])],
      }));
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.orders(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders(storeId) });
    },
  });
}

export function useDeleteOrderTemplate(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAuthJson<{ success: boolean }>(
        `/api/order-templates?id=${encodeURIComponent(id)}&storeId=${encodeURIComponent(storeId)}`,
        { method: 'DELETE' },
      ),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.orders(storeId) });
      const prev = queryClient.getQueryData<{ templates: OrderTemplate[] }>(queryKeys.orders(storeId));
      queryClient.setQueryData<{ templates: OrderTemplate[] }>(
        queryKeys.orders(storeId),
        old => ({ templates: old?.templates?.filter(t => t.id !== id) ?? [] }),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.orders(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.orders(storeId) });
    },
  });
}
