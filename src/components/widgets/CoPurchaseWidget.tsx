'use client';

import Link from 'next/link';
import { ArrowRight, Link2 } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { useCoPurchase } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface CoPurchasePair {
  item: string;
  togetherCount: number;
  anchorRate: number;
  lift: number;
}

export default function CoPurchaseWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useCoPurchase(storeId || '', !!storeId);
  const pairs = (data?.pairs || []) as CoPurchasePair[];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const analysis = useWidgetAnalysis('co_purchase', storeId || undefined, data);

  return (
    <WidgetWrapper
      title="🔗 세트·공동구매"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '공동구매 데이터 조회 실패') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : data?.emptyReason && pairs.length === 0 && !isLoading ? (
        <div className="p-3"><WidgetEmptyReason reason={data.emptyReason} /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <p className="text-[10px] text-slate-500 shrink-0">
            기준 <span className="text-teal-400">{data.anchorKeyword}</span>
            {' · '}{data.anchorReceiptCount}/{data.totalReceiptCount}건 영수증
          </p>
          <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 text-[10px]">
            {pairs.map(p => (
              <li key={p.item} className="flex justify-between gap-2 border-b border-slate-800/60 pb-1">
                <span className="text-slate-200 truncate flex items-center gap-1">
                  <Link2 className="w-3 h-3 text-teal-500 shrink-0" />
                  {p.item}
                </span>
                <span className="shrink-0 text-right">
                  <span className="text-teal-400">{p.anchorRate}%</span>
                  <span className="text-slate-600 mx-1">·</span>
                  <span className={p.lift >= 1.5 ? 'text-amber-400' : 'text-slate-400'}>
                    lift {p.lift.toFixed(1)}x
                  </span>
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/customers"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
          >
            전체 분석 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
