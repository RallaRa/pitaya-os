'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';
import type { SalesDocData } from '@/lib/posDailySales';

export interface TodaySalesPayload {
  todayStr?: string;
  yesterdayStr?: string;
  today?: SalesDocData | null;
  yesterday?: SalesDocData | null;
  totalSales?: number;
  netSales?: number;
  returnAmount?: number;
  yesterdayTotal?: number;
  yesterdayNet?: number;
  isClosed?: boolean;
  syncedAt?: string | null;
  noData?: boolean;
  emptyReason?: string | null;
}

export function useSalesData(storeId: string, date?: string, enabled = true) {
  const qs = new URLSearchParams({ storeId });
  if (date) qs.set('date', date);

  return useQuery({
    queryKey: queryKeys.sales(storeId, date),
    queryFn: () => fetchAuthJson<TodaySalesPayload>(`/api/dashboard/today-sales?${qs.toString()}`),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.sales,
    refetchInterval: 30_000,
    refetchIntervalInBackground: true,
  });
}
