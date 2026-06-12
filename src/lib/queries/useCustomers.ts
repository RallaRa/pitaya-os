'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface CustomerListParams {
  storeId: string;
  page?: number;
  limit?: number;
  search?: string;
  sortBy?: string;
  sortOrder?: string;
  joinFrom?: string;
  joinTo?: string;
  visitFrom?: string;
  visitTo?: string;
  cycleStatus?: string;
  visitTrend?: string;
  exportAll?: boolean;
  enabled?: boolean;
}

export interface CustomersListResult {
  customers: Record<string, unknown>[];
  total: number;
  stats?: Record<string, unknown>;
}

type CustomerQueryFilters = Omit<CustomerListParams, 'storeId' | 'enabled'>;

export function buildCustomersSearchParams(params: CustomerQueryFilters & { storeId: string }) {
  const qs = new URLSearchParams({
    storeId: params.storeId,
    page: String(params.page ?? 1),
    limit: String(params.limit ?? 50),
  });
  if (params.sortBy) qs.set('sortBy', params.sortBy);
  if (params.sortOrder) qs.set('sortOrder', params.sortOrder);
  if (params.search?.trim()) qs.set('search', params.search.trim());
  if (params.joinFrom) qs.set('joinFrom', params.joinFrom);
  if (params.joinTo) qs.set('joinTo', params.joinTo);
  if (params.visitFrom) qs.set('visitFrom', params.visitFrom);
  if (params.visitTo) qs.set('visitTo', params.visitTo);
  if (params.cycleStatus) qs.set('cycleStatus', params.cycleStatus);
  if (params.visitTrend) qs.set('visitTrend', params.visitTrend);
  if (params.exportAll) qs.set('exportAll', '1');
  return qs;
}

export async function fetchCustomersList(params: CustomerListParams): Promise<CustomersListResult> {
  const qs = buildCustomersSearchParams(params);
  const data = await fetchAuthJson<{
    customers?: Record<string, unknown>[];
    total?: number;
    stats?: Record<string, unknown>;
    error?: string;
  }>(`/api/customers?${qs.toString()}`);
  return {
    customers: data.customers ?? [],
    total: data.total ?? 0,
    stats: data.stats,
  };
}

export function useCustomers(params: CustomerListParams) {
  const { storeId, enabled = true, ...filters } = params;
  return useQuery({
    queryKey: queryKeys.customers(storeId, filters),
    queryFn: () => fetchCustomersList({ storeId, ...filters }),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.customers,
    select: data => ({
      customers: data.customers,
      total: data.total,
      stats: data.stats,
    }),
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
      queryClient.setQueriesData<CustomersListResult>({ queryKey: ['customers', storeId] }, old =>
        old
          ? {
              ...old,
              customers: [
                {
                  cusCode: '등록중…',
                  nameMasked: body.name,
                  phoneMasked: body.phone,
                  grade: body.grade,
                },
                ...old.customers,
              ],
              total: old.total + 1,
            }
          : old,
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['customers', storeId] });
    },
  });
}
