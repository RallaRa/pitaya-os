'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface EmployeeSummary {
  docId?: string;
  empNo: string;
  name: string;
  department?: string;
  position?: string;
  status?: string;
  hireDate?: string;
  linkedUid?: string;
  [key: string]: unknown;
}

export function useEmployees(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.employees(storeId),
    queryFn: () =>
      fetchAuthJson<{ employees: EmployeeSummary[] }>(
        `/api/hr/employees?storeId=${encodeURIComponent(storeId)}`,
      ),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.employees,
    select: data => data.employees ?? [],
  });
}

export function useCreateEmployee(storeId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      fetchAuthJson<{ ok: boolean; empNo: string }>('/api/hr/employees', {
        method: 'POST',
        body: JSON.stringify({ storeId, ...body }),
      }),
    onMutate: async (body) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.employees(storeId) });
      const prev = queryClient.getQueryData<{ employees: EmployeeSummary[] }>(queryKeys.employees(storeId));
      const optimistic: EmployeeSummary = {
        empNo: '등록중…',
        name: String(body.name || ''),
        department: String(body.department || ''),
        position: String(body.position || '사원'),
        status: '재직',
      };
      queryClient.setQueryData<{ employees: EmployeeSummary[] }>(queryKeys.employees(storeId), old => ({
        employees: [optimistic, ...(old?.employees ?? [])],
      }));
      return { prev };
    },
    onError: (_err, _body, ctx) => {
      if (ctx?.prev) queryClient.setQueryData(queryKeys.employees(storeId), ctx.prev);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.employees(storeId) });
    },
  });
}
