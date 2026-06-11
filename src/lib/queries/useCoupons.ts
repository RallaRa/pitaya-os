'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface CouponRecord {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount?: number;
  maxDiscount?: number;
  maxUse?: number;
  usedCount?: number;
  isActive?: boolean;
  title?: string;
  description?: string;
  endDate?: string | null;
  [key: string]: unknown;
}

export function useCoupons(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.coupons(storeId),
    queryFn: () =>
      fetchAuthJson<{ coupons: CouponRecord[] }>(
        `/api/coupons?storeId=${encodeURIComponent(storeId)}`,
      ),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.coupons,
    select: data => data.coupons ?? [],
  });
}

export interface CreateCouponInput {
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  minAmount?: number;
  maxDiscount?: number;
  maxUse?: number;
  startDate?: string | null;
  endDate?: string | null;
  title?: string;
  description?: string;
  includeBarcode?: boolean;
}

export function useCreateCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: CreateCouponInput) =>
      fetchAuthJson<{ id: string; code: string }>('/api/coupons', {
        method: 'POST',
        body: JSON.stringify({ storeId, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.coupons(storeId) });
      const prev = queryClient.getQueryData<{ coupons: CouponRecord[] }>(queryKeys.coupons(storeId));
      const optimistic: CouponRecord = {
        id: `temp-${Date.now()}`,
        code: body.code.toUpperCase(),
        type: body.type,
        value: body.value,
        minAmount: body.minAmount,
        maxDiscount: body.maxDiscount,
        maxUse: body.maxUse,
        usedCount: 0,
        isActive: true,
        title: body.title,
        endDate: body.endDate,
      };
      queryClient.setQueryData<{ coupons: CouponRecord[] }>(queryKeys.coupons(storeId), old => ({
        coupons: [optimistic, ...(old?.coupons ?? [])],
      }));
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.coupons(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coupons(storeId) });
    },
  });
}

export function useToggleCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (coupon: CouponRecord) =>
      fetchAuthJson('/api/coupons', {
        method: 'PUT',
        body: JSON.stringify({ id: coupon.id, storeId, isActive: !coupon.isActive }),
      }),
    onMutate: async (coupon) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.coupons(storeId) });
      const prev = queryClient.getQueryData<{ coupons: CouponRecord[] }>(queryKeys.coupons(storeId));
      queryClient.setQueryData<{ coupons: CouponRecord[] }>(
        queryKeys.coupons(storeId),
        old => ({
          coupons: old?.coupons?.map(c => (c.id === coupon.id ? { ...c, isActive: !c.isActive } : c)) ?? [],
        }),
      );
      return { prev };
    },
    onError: (_err, _coupon, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.coupons(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coupons(storeId) });
    },
  });
}

export function useDeleteCoupon(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetchAuthJson(`/api/coupons?id=${encodeURIComponent(id)}&storeId=${encodeURIComponent(storeId)}`, {
        method: 'DELETE',
      }),
    onMutate: async (id) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.coupons(storeId) });
      const prev = queryClient.getQueryData<{ coupons: CouponRecord[] }>(queryKeys.coupons(storeId));
      queryClient.setQueryData<{ coupons: CouponRecord[] }>(
        queryKeys.coupons(storeId),
        old => ({ coupons: old?.coupons?.filter(c => c.id !== id) ?? [] }),
      );
      return { prev };
    },
    onError: (_err, _id, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.coupons(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.coupons(storeId) });
    },
  });
}
