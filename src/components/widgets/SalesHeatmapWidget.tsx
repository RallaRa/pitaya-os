'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import SalesHeatmapGrid, { HeatmapInsightsList } from '@/components/analytics/SalesHeatmapGrid';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { HeatmapCell, HeatmapInsight } from '@/lib/salesHeatmapCalc';
import { ArrowRight } from 'lucide-react';

export default function SalesHeatmapWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [cells, setCells] = useState<HeatmapCell[][]>([]);
  const [insights, setInsights] = useState<HeatmapInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/sales-heatmap?storeId=${encodeURIComponent(storeId)}&range=1m`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setCells(d.cells || []);
      setInsights((d.insights || []).slice(0, 2));
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '히트맵을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <WidgetWrapper
      title="🗓️ 시간대 히트맵"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
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
        </div>
      ) : !loading && !error ? (
        <p className="text-slate-500 text-xs text-center p-3">시간대 데이터 없음</p>
      ) : null}
    </WidgetWrapper>
  );
}
