'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Send, Loader2, AlertTriangle } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { useChurnRisk } from '@/lib/queries';
import type { ChurnScoreFactors } from '@/lib/customerChurnScore';
import { VISIT_TREND_LABELS } from '@/lib/customerVisitTrend';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface ChurnRow {
  cusCode: string;
  name: string;
  phoneMasked: string;
  churnScore: number;
  factors: ChurnScoreFactors;
  daysSinceLastVisit: number | null;
  visitTrend: VisitTrendSegment;
  pitayaGrade: string;
}

function scoreColor(score: number): string {
  if (score >= 85) return 'text-rose-400';
  if (score >= 70) return 'text-amber-400';
  return 'text-slate-400';
}

export default function ChurnRiskWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const { data, isLoading, isError, refetch, dataUpdatedAt, error } = useChurnRisk(storeId || '', 10, !!storeId);
  const items = (data?.items || []) as ChurnRow[];
  const totalAtRisk = data?.totalAtRisk ?? 0;
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const [queueing, setQueueing] = useState<string | null>(null);
  const [queueMsg, setQueueMsg] = useState('');
  const analysis = useWidgetAnalysis('churn_risk', storeId || undefined, data ? { totalAtRisk, items } : undefined);

  const enqueue = async (cusCode: string) => {
    if (!storeId) return;
    setQueueing(cusCode);
    setQueueMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/churn-queue', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, cusCode }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '큐 등록 실패');
      setQueueMsg(`${cusCode} 알림톡 큐 등록 (${d.created}건)`);
    } catch (e: unknown) {
      setQueueMsg(e instanceof Error ? e.message : '큐 등록 실패');
    } finally {
      setQueueing(null);
    }
  };

  return (
    <WidgetWrapper
      title="⚠️ 이탈 위험 고객"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '이탈 위험 데이터를 불러오지 못했습니다') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : items.length === 0 && !isLoading ? (
        <div className="p-3">
          <WidgetEmptyReason reason="이탈 위험(70점+) 고객이 없습니다." />
        </div>
      ) : (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500">
              70점+ <span className="text-rose-400 font-semibold">{totalAtRisk}명</span>
            </span>
            <Link
              href="/dashboard/customers/churn-risk"
              className="text-teal-400 hover:text-teal-300 flex items-center gap-0.5"
            >
              전체 보기 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          {queueMsg && (
            <p className="text-[10px] text-teal-300/90 truncate">{queueMsg}</p>
          )}

          <ul className="flex-1 overflow-y-auto space-y-1.5 min-h-0">
            {items.map((row, idx) => (
              <li
                key={row.cusCode}
                className="flex items-center gap-2 px-2 py-1.5 rounded-lg bg-slate-800/60 border border-slate-700/50"
              >
                <span className="text-[10px] text-slate-600 w-4 shrink-0">{idx + 1}</span>
                <div className="flex-1 min-w-0">
                  <Link
                    href={`/dashboard/customers?cusCode=${encodeURIComponent(row.cusCode)}`}
                    className="text-[11px] text-slate-200 hover:text-teal-300 truncate block"
                  >
                    {row.name}
                    <span className="text-slate-500 ml-1">({row.cusCode})</span>
                  </Link>
                  <p className="text-[9px] text-slate-500 truncate">
                    {VISIT_TREND_LABELS[row.visitTrend] || row.visitTrend}
                    {row.daysSinceLastVisit != null && ` · ${row.daysSinceLastVisit}일`}
                    {row.pitayaGrade && ` · ${row.pitayaGrade}`}
                  </p>
                </div>
                <span className={`text-xs font-bold tabular-nums shrink-0 ${scoreColor(row.churnScore)}`}>
                  {row.churnScore}
                </span>
                <button
                  type="button"
                  title="알림톡 큐 등록"
                  disabled={queueing === row.cusCode}
                  onClick={() => enqueue(row.cusCode)}
                  className="p-1 rounded text-teal-400 hover:bg-teal-950/50 disabled:opacity-40 shrink-0"
                >
                  {queueing === row.cusCode
                    ? <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    : <Send className="w-3.5 h-3.5" />}
                </button>
              </li>
            ))}
          </ul>

          {totalAtRisk > 10 && (
            <p className="text-[9px] text-slate-600 flex items-center gap-1">
              <AlertTriangle className="w-3 h-3" />
              외 {totalAtRisk - 10}명 — 상세 페이지에서 확인
            </p>
          )}
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      )}
    </WidgetWrapper>
  );
}
