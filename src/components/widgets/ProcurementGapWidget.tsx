'use client';

import Link from 'next/link';
import { ArrowRight, AlertTriangle, Package } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { useProcurementGap } from '@/lib/queries';
import type { ProcurementGapRow } from '@/lib/procurementGap.server';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

function statusBadge(status: ProcurementGapRow['status']) {
  if (status === 'shortage_risk') return { label: '부족', cls: 'text-rose-400 bg-rose-950/40' };
  if (status === 'surplus_risk') return { label: '과잉', cls: 'text-amber-400 bg-amber-950/40' };
  return { label: '정상', cls: 'text-teal-400 bg-teal-950/40' };
}

export default function ProcurementGapWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useProcurementGap(storeId || '', !!storeId);
  const gaps = (data?.gaps || []) as ProcurementGapRow[];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const analysis = useWidgetAnalysis('procurement_gap', storeId || undefined, data);

  return (
    <WidgetWrapper
      title="📦 발주 vs 예측"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '발주 갭 조회 실패') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : data?.emptyReason && gaps.length === 0 && !isLoading ? (
        <div className="p-3"><WidgetEmptyReason reason={data.emptyReason} /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <p className="text-[10px] text-slate-500 shrink-0">
            {data.targetDate} 기준 · 예측 {data.predictionDate}
            {data.weatherCondition ? ` · ${data.weatherCondition}` : ''}
          </p>
          <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 text-[10px]">
            {gaps.map(row => {
              const badge = statusBadge(row.status);
              return (
                <li key={row.itemName} className="border-b border-slate-800/60 pb-1.5">
                  <div className="flex justify-between gap-2 items-start">
                    <span className="text-slate-200 truncate flex items-center gap-1">
                      {row.status === 'shortage_risk' && <AlertTriangle className="w-3 h-3 text-rose-400 shrink-0" />}
                      {row.status !== 'shortage_risk' && <Package className="w-3 h-3 text-slate-500 shrink-0" />}
                      {row.itemName}
                    </span>
                    <span className={`shrink-0 px-1.5 py-0.5 rounded text-[9px] ${badge.cls}`}>{badge.label}</span>
                  </div>
                  <p className="text-slate-500 mt-0.5">
                    권장 {row.recommendedQty} · 어제 {row.yesterdayQty} · 7일평균 {row.avgDailyQty}
                  </p>
                </li>
              );
            })}
          </ul>
          <Link
            href="/dashboard/order"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
          >
            발주 화면 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
