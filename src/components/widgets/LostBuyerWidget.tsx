'use client';

import Link from 'next/link';
import { ArrowRight, UserMinus } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { useLostBuyers } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface LostBuyerRow {
  itemName: string;
  lostBuyerCount: number;
  repeatBuyerCount: number;
  avgDaysSinceLast: number;
}

export default function LostBuyerWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useLostBuyers(storeId || '', !!storeId);
  const items = (data?.items || []) as LostBuyerRow[];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const analysis = useWidgetAnalysis('lost_buyers', storeId || undefined, data);

  return (
    <WidgetWrapper
      title="📉 품목별 이탈 고객"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '이탈 고객 조회 실패') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : data?.emptyReason && items.length === 0 && !isLoading ? (
        <div className="p-3"><WidgetEmptyReason reason={data.emptyReason} /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <p className="text-[10px] text-slate-500 shrink-0">
            {data.inactiveDays}일 미방문 · 재구매 {data.minRepeatPurchases}회+ · 총 {data.totalLostBuyers}명
          </p>
          <ul className="flex-1 min-h-0 overflow-y-auto space-y-1.5 text-[10px]">
            {items.map(row => (
              <li key={row.itemName} className="flex justify-between gap-2 border-b border-slate-800/60 pb-1">
                <span className="text-slate-200 truncate flex items-center gap-1">
                  <UserMinus className="w-3 h-3 text-rose-400 shrink-0" />
                  {row.itemName}
                </span>
                <span className="shrink-0 text-right text-slate-400">
                  <span className="text-rose-400">{row.lostBuyerCount}명</span>
                  <span className="text-slate-600 mx-1">/</span>
                  {row.repeatBuyerCount}명 · {row.avgDaysSinceLast}일
                </span>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/marketing/journey"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
          >
            CRM 여정 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
