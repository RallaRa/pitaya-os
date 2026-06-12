'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { useRfmPipeline } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

const GRADE_COLORS: Record<string, string> = {
  VIP: 'bg-amber-500',
  '단골': 'bg-teal-500',
  '일반': 'bg-slate-500',
  '이탈위험': 'bg-orange-500',
  '이탈': 'bg-rose-500',
};

interface GradeRow {
  grade: string;
  label: string;
  count: number;
  sharePct: number;
}

export default function RfmPipelineWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useRfmPipeline(storeId || '', !!storeId);
  const grades = (data?.grades || []) as GradeRow[];
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const analysis = useWidgetAnalysis('rfm_pipeline', storeId || undefined, data);

  const vip = grades.find(g => g.grade === 'VIP');
  const atRisk = grades.find(g => g.grade === '이탈위험');

  return (
    <WidgetWrapper
      title="👑 RFM 고객 등급"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : 'RFM 등급 조회 실패') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : data?.emptyReason && !data.total && !isLoading ? (
        <div className="p-3"><WidgetEmptyReason reason={data.emptyReason} /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <p className="text-[10px] text-slate-500 shrink-0">
            등록 {data.total}명
            {vip ? ` · VIP ${vip.count}명 (${vip.sharePct}%)` : ''}
            {atRisk && atRisk.count > 0 ? ` · 이탈위험 ${atRisk.count}명` : ''}
          </p>
          <ul className="flex-1 min-h-0 overflow-y-auto space-y-2 text-[10px]">
            {grades.filter(g => g.count > 0).map(g => (
              <li key={g.grade}>
                <div className="flex justify-between mb-0.5">
                  <span className="text-slate-300">{g.label}</span>
                  <span className="text-slate-400">{g.count}명 · {g.sharePct}%</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${GRADE_COLORS[g.grade] || 'bg-slate-500'}`}
                    style={{ width: `${Math.min(100, g.sharePct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
          <Link
            href="/dashboard/customers"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
          >
            고객 관리 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
