'use client';

import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import { useRepurchaseDue } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface DueCustomer {
  cusCode: string;
  name: string;
  avgCycleDays: number;
  daysSinceLastVisit: number;
  overdueDays: number;
  pitayaGrade: string;
}

export default function RepurchaseDueWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const { data, isLoading, isError, refetch, error } = useRepurchaseDue(storeId || '', !!storeId);
  const customers = (data?.customers || []) as DueCustomer[];
  const count = data?.count ?? 0;
  const date = data?.date ?? '';
  const analysis = useWidgetAnalysis('repurchase_due', storeId || undefined, data ? { count, customers } : undefined);

  return (
    <WidgetWrapper
      title="재구매 주기 임박"
      editMode={editMode}
      onRemove={onRemove}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '조회 실패') : null}
      onRefresh={() => void refetch()}
    >
      {count === 0 ? (
        <div className="space-y-2">
          <p className="text-slate-500 text-xs">평균 주기+2일 초과 고객 없음 ({date || '오늘'})</p>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-amber-400/90 text-xs">{count}명 · 알림톡 큐 등록 대상 (notification_queue)</p>
          <ul className="space-y-1.5 max-h-48 overflow-y-auto">
            {customers.slice(0, 8).map(c => (
              <li key={c.cusCode} className="flex justify-between gap-2 text-xs border-b border-slate-800/80 pb-1">
                <span className="text-slate-200 truncate">{c.name || c.cusCode}</span>
                <span className="text-slate-500 shrink-0">{c.daysSinceLastVisit}일 · +{c.overdueDays}일</span>
              </li>
            ))}
          </ul>
          <Link href="/dashboard/marketing/journey" className="text-teal-400 text-xs hover:underline">
            알림 큐 확인 →
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      )}
    </WidgetWrapper>
  );
}
