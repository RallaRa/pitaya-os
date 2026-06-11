'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';

export interface TodaySalesData {
  todayNetSales?: number;
  yesterdayNetSales?: number;
  todayTotalSale?: number;
  customerCount?: number;
  emptyReason?: string;
  [key: string]: unknown;
}

export function useSalesData(storeId: string, date?: string, enabled = true) {
  const qs = new URLSearchParams({ storeId });
  if (date) qs.set('date', date);

  return useQuery({
    queryKey: queryKeys.sales(storeId, date),
    queryFn: () => fetchAuthJson<TodaySalesData>(`/api/dashboard/today-sales?${qs.toString()}`),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.sales,
  });
}
