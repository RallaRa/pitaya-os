'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface CustomerRow {
  id: string;
  cusCode: string;
  name: string;
  mobile?: string;
  grade?: string;
  [key: string]: unknown;
}

interface CustomersResponse {
  customers: CustomerRow[];
  total?: number;
}

export interface UseCustomersParams {
  storeId: string;
  page?: number;
  limit?: number;
  search?: string;
  enabled?: boolean;
}

function buildCustomersUrl(storeId: string, params: Omit<UseCustomersParams, 'storeId' | 'enabled'>) {
  const qs = new URLSearchParams({ storeId });
  if (params.page) qs.set('page', String(params.page));
  if (params.limit) qs.set('limit', String(params.limit));
  if (params.search) qs.set('search', params.search);
  return `/api/customers?${qs.toString()}`;
}

export function useCustomers({ storeId, page = 1, limit = 50, search, enabled = true }: UseCustomersParams) {
  const params = { page, limit, search };
  return useQuery({
    queryKey: queryKeys.customers(storeId, params),
    queryFn: () => fetchAuthJson<CustomersResponse>(buildCustomersUrl(storeId, params)),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.customers,
    select: data => ({ customers: data.customers ?? [], total: data.total ?? 0 }),
  });
}

export function useRegisterCustomer(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: { name: string; phone: string; grade: string; memo?: string }) =>
      fetchAuthJson<{ cusCode: string }>('/api/customers/register', {
        method: 'POST',
        body: JSON.stringify({ storeId, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: ['customers', storeId] });
      const temp: CustomerRow = {
        id: `temp-${Date.now()}`,
        cusCode: '등록중…',
        name: body.name,
        mobile: body.phone,
        grade: body.grade,
      };
      queryClient.setQueriesData<CustomersResponse>({ queryKey: ['customers', storeId] }, old =>
        old ? { ...old, customers: [temp, ...(old.customers ?? [])], total: (old.total ?? 0) + 1 } : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', storeId] });
    },
  });
}
