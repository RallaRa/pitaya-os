'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import WidgetAsyncBoundary from '@/components/suspense/WidgetAsyncBoundary';
import EmptyState from '@/components/suspense/EmptyState';
import { fetchAuthJson } from '@/components/suspense/fetchJson';
import { useSuspenseInvalidate, useSuspenseResource } from '@/components/suspense/useSuspenseResource';
import { Settings } from 'lucide-react';

interface CostRatioItemRow {
  id: string;
  name: string;
  actualRatio: number;
  targetRatio: number;
  isOverTarget: boolean;
  isEstimated: boolean;
}

interface CostRatioData {
  storeAvgRatio: number | null;
  globalTargetRatio: number;
  items: CostRatioItemRow[];
  offenders: CostRatioItemRow[];
}

function cacheKey(storeId: string) {
  return `dashboard:cost-ratio:${storeId}`;
}

async function fetchCostRatio(storeId: string): Promise<CostRatioData> {
  const data = await fetchAuthJson<CostRatioData>(
    `/api/dashboard/cost-ratio?storeId=${encodeURIComponent(storeId)}`,
  );
  return {
    storeAvgRatio: data.storeAvgRatio ?? null,
    globalTargetRatio: data.globalTargetRatio ?? 0.65,
    items: data.items ?? [],
    offenders: data.offenders ?? [],
  };
}

function CostRatioContent({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId: string }) {
  const key = cacheKey(storeId);
  const invalidate = useSuspenseInvalidate(key);
  const { storeAvgRatio, globalTargetRatio, items, offenders } = useSuspenseResource(
    key,
    () => fetchCostRatio(storeId),
  );
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [storeAvgRatio, items]);

  const refresh = useCallback(() => invalidate(), [invalidate]);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  const displayItems = [...items]
    .sort((a, b) => {
      if (a.isOverTarget !== b.isOverTarget) return a.isOverTarget ? -1 : 1;
      return b.actualRatio - a.actualRatio;
    })
    .slice(0, 8);

  return (
    <WidgetWrapper
      title="⚠️ 원가율 모니터"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      <div className="p-3 space-y-2 h-full flex flex-col overflow-hidden">
        <div className="flex items-baseline justify-between gap-2 shrink-0">
          <div>
            <span className="text-xl font-bold text-teal-400">
              {storeAvgRatio != null ? pct(storeAvgRatio) : '—'}
            </span>
            <span className="text-slate-500 text-[10px] ml-1.5">매장 평균</span>
          </div>
          <span className="text-[10px] text-slate-500">목표 {pct(globalTargetRatio)}</span>
        </div>

        {displayItems.length > 0 ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <table className="w-full text-[10px]">
              <thead>
                <tr className="text-slate-600 border-b border-slate-800">
                  <th className="text-left py-1 font-normal">품목</th>
                  <th className="text-right py-1 font-normal">원가율</th>
                  <th className="text-right py-1 font-normal">목표</th>
                </tr>
              </thead>
              <tbody>
                {displayItems.map(o => (
                  <tr
                    key={o.id}
                    className={o.isOverTarget ? 'bg-red-950/30 text-red-300' : 'text-slate-400'}
                  >
                    <td className="py-1 pr-1 truncate max-w-[90px]">
                      {o.name}
                      {o.isEstimated && <span className="text-slate-600 ml-0.5">추정</span>}
                    </td>
                    <td className={`py-1 text-right font-medium ${o.isOverTarget ? 'text-red-400' : 'text-slate-300'}`}>
                      {pct(o.actualRatio)}
                    </td>
                    <td className="py-1 text-right text-slate-500">{pct(o.targetRatio)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState reason="원가율 데이터가 없습니다." compact />
        )}

        {offenders.length === 0 && displayItems.length > 0 && (
          <p className="text-[10px] text-teal-400/80 shrink-0">목표 초과 품목 없음</p>
        )}

        <Link
          href="/dashboard/settings/cost-ratio-targets"
          className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
        >
          <Settings className="w-3 h-3" /> 목표 설정
        </Link>
      </div>
    </WidgetWrapper>
  );
}

export default function CostRatioWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  if (!storeId) {
    return (
      <WidgetWrapper title="원가율 모니터" editMode={editMode} onRemove={onRemove}>
        <div className="p-4"><EmptyState reason="매장이 선택되지 않았습니다." compact /></div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetAsyncBoundary skeleton="widget" widgetName="원가율">
      <CostRatioContent editMode={editMode} onRemove={onRemove} storeId={storeId} />
    </WidgetAsyncBoundary>
  );
}
