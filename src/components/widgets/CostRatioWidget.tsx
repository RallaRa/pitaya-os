'use client';

import { useCallback, useEffect, useState } from 'react';
import WidgetWrapper from './WidgetWrapper';
import WidgetAsyncBoundary from '@/components/suspense/WidgetAsyncBoundary';
import EmptyState from '@/components/suspense/EmptyState';
import { fetchAuthJson } from '@/components/suspense/fetchJson';
import { useSuspenseInvalidate, useSuspenseResource } from '@/components/suspense/useSuspenseResource';

interface Offender {
  name: string;
  actualRatio: number;
  targetRatio: number;
}

interface CostRatioData {
  storeAvgRatio: number | null;
  offenders: Offender[];
}

function cacheKey(storeId: string) {
  return `dashboard:cost-ratio:${storeId}`;
}

async function fetchCostRatio(storeId: string): Promise<CostRatioData> {
  const data = await fetchAuthJson<{ storeAvgRatio?: number; offenders?: Offender[] }>(
    `/api/dashboard/cost-ratio?storeId=${encodeURIComponent(storeId)}`,
  );
  return {
    storeAvgRatio: data.storeAvgRatio ?? null,
    offenders: data.offenders ?? [],
  };
}

function CostRatioContent({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId: string }) {
  const key = cacheKey(storeId);
  const invalidate = useSuspenseInvalidate(key);
  const { storeAvgRatio, offenders } = useSuspenseResource(key, () => fetchCostRatio(storeId));
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [storeAvgRatio, offenders]);

  const refresh = useCallback(() => invalidate(), [invalidate]);
  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <WidgetWrapper
      title="원가율 모니터"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      <div className="p-4 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-teal-400">{storeAvgRatio != null ? pct(storeAvgRatio) : '—'}</span>
          <span className="text-slate-500 text-xs">매장 평균 원가율</span>
        </div>
        {offenders.length > 0 ? (
          <ul className="space-y-1.5">
            {offenders.slice(0, 5).map(o => (
              <li key={o.name} className="flex justify-between text-xs">
                <span className="text-slate-300 truncate mr-2">{o.name}</span>
                <span className="text-red-400 shrink-0">{pct(o.actualRatio)} / 목표 {pct(o.targetRatio)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyState reason="목표 초과 품목이 없습니다." compact />
        )}
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
