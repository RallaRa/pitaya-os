'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';
import type { BriefingActionLogRecord } from '@/lib/briefing/briefingActionLog.types';

export interface BriefingActionAttributionData {
  actions: BriefingActionLogRecord[];
  summary: {
    total: number;
    completed: number;
    tracking: number;
    avgDeltaPct: number | null;
    positiveCount: number;
  };
}

export function useBriefingActionAttribution(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.briefingAttribution(storeId),
    queryFn: () => fetchAuthJson<BriefingActionAttributionData>(
      `/api/briefing/action-attribution?storeId=${encodeURIComponent(storeId)}&days=7`,
    ),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.sales,
    refetchInterval: 10 * 60_000,
    refetchOnWindowFocus: true,
  });
}
