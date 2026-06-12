'use client';

import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import SalesHeatmapGrid, { HeatmapInsightsList } from '@/components/analytics/SalesHeatmapGrid';
import { useSalesHeatmap } from '@/lib/queries';
import type { HeatmapCell, HeatmapInsight } from '@/lib/salesHeatmapCalc';
import { ArrowRight } from 'lucide-react';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

export default function SalesHeatmapWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useSalesHeatmap(storeId || '', '1m', !!storeId);
  const cells = (data?.cells || []) as HeatmapCell[][];
  const insights = ((data?.insights || []) as HeatmapInsight[]).slice(0, 2);
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const analysis = useWidgetAnalysis('sales_heatmap', storeId || undefined, data ? { insights } : undefined);

  return (
    <WidgetWrapper
      title="🗓️ 시간대 히트맵"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '히트맵을 불러오지 못했습니다') : null}
    >
      {!storeId ? (
        <div className="p-3">
          <WidgetEmptyReason reason="매장이 선택되지 않았습니다." />
        </div>
      ) : cells.length > 0 ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <HeatmapInsightsList insights={insights} />
          <div className="flex-1 min-h-0 overflow-hidden scale-[0.92] origin-top">
            <SalesHeatmapGrid cells={cells} compact />
          </div>
          <Link
            href="/dashboard/analytics/heatmap"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 pt-1"
          >
            상세 분석 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : !isLoading && !isError ? (
        <p className="text-slate-500 text-xs text-center p-3">시간대 데이터 없음</p>
      ) : null}
    </WidgetWrapper>
  );
}
