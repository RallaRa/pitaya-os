'use client';

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';
import {
  buildWidgetAnalysis,
  type PerformanceContext,
  type WidgetAnalysisBlock,
  type WidgetAnalysisId,
} from '@/lib/widgetPerformanceAnalysis';

export function usePerformanceContext(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.performanceContext(storeId),
    queryFn: () => fetchAuthJson<PerformanceContext>(
      `/api/dashboard/performance-context?storeId=${encodeURIComponent(storeId)}`,
    ),
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.sales,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useWidgetAnalysis(
  widgetId: WidgetAnalysisId,
  storeId: string | undefined,
  widgetData: unknown,
  enabled = true,
): WidgetAnalysisBlock | null {
  const { data: ctx } = usePerformanceContext(storeId || '', !!storeId && enabled && !!widgetData);

  return useMemo(() => {
    if (!ctx || !widgetData) return null;
    return buildWidgetAnalysis(widgetId, widgetData, ctx);
  }, [widgetId, widgetData, ctx]);
}
