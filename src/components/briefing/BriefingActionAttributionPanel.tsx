'use client';

import { TrendingDown, TrendingUp, Minus, BarChart3 } from 'lucide-react';
import { useBriefingActionAttribution } from '@/lib/queries/useBriefingAttribution';
import { BRIEFING_EXECUTE_LABELS } from '@/lib/briefingActions';
import type { BriefingActionLogRecord } from '@/lib/briefing/briefingActionLog.types';

function fmtWon(n: number): string {
  if (n <= 0) return '-';
  if (n >= 10000) return `${Math.round(n / 10000)}만`;
  return n.toLocaleString();
}

function deltaDisplay(delta: number | null | undefined) {
  if (delta == null) return { text: '집계중', color: 'text-slate-400', Icon: Minus };
  if (delta > 0) return { text: `+${delta}%`, color: 'text-green-400', Icon: TrendingUp };
  if (delta < 0) return { text: `${delta}%`, color: 'text-red-400', Icon: TrendingDown };
  return { text: '0%', color: 'text-slate-400', Icon: Minus };
}

function ActionAttributionRow({ action }: { action: BriefingActionLogRecord }) {
  const label = action.actionType !== 'none'
    ? BRIEFING_EXECUTE_LABELS[action.actionType as keyof typeof BRIEFING_EXECUTE_LABELS]
    : '실행';
  const attr = action.attribution;
  const delta = deltaDisplay(attr?.deltaPct);
  const Icon = delta.Icon;

  return (
    <div className="bg-slate-800/35 border border-slate-700/30 rounded-lg px-2.5 py-2">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[9px] px-1 py-0.5 rounded bg-slate-700 text-slate-300">{label}</span>
            <span className="text-[9px] text-slate-500">{action.executeDateYmd}</span>
            {action.status === 'started' && (
              <span className="text-[9px] text-amber-400">진행중</span>
            )}
          </div>
          <p className="text-[10px] text-slate-300 mt-0.5 line-clamp-2">{action.text}</p>
        </div>
        <div className={`shrink-0 text-right ${delta.color}`}>
          <div className="flex items-center gap-0.5 justify-end">
            <Icon className="w-3 h-3" />
            <span className="text-xs font-bold">{delta.text}</span>
          </div>
          {attr && attr.impactDays > 0 && (
            <p className="text-[8px] text-slate-500 mt-0.5">
              {fmtWon(attr.baselineAvg)}→{fmtWon(attr.impactAvg)}
            </p>
          )}
        </div>
      </div>
      {attr && attr.trackingDaysLeft > 0 && action.status === 'completed' && (
        <p className="text-[8px] text-slate-500 mt-1">
          7일 추적 · {7 - attr.trackingDaysLeft}/{7}일 데이터
        </p>
      )}
    </div>
  );
}

export default function BriefingActionAttributionPanel({ storeId }: { storeId: string }) {
  const { data, isLoading } = useBriefingActionAttribution(storeId);

  if (isLoading) {
    return (
      <div className="bg-slate-900/40 border border-slate-700/30 rounded-xl p-3 animate-pulse h-16" />
    );
  }

  if (!data?.actions?.length) return null;

  const { summary, actions } = data;

  return (
    <div className="bg-violet-900/15 border border-violet-700/30 rounded-xl p-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-[10px] font-semibold text-violet-300 flex items-center gap-1">
          <BarChart3 className="w-3 h-3" /> 7일 실행 효과
        </p>
        <div className="text-[9px] text-violet-300/80">
          {summary.completed}건 완료
          {summary.avgDeltaPct != null && (
            <span className={summary.avgDeltaPct >= 0 ? ' text-green-400' : ' text-red-400'}>
              {' '}· 평균 {summary.avgDeltaPct > 0 ? '+' : ''}{summary.avgDeltaPct}%
            </span>
          )}
        </div>
      </div>
      <p className="text-[9px] text-slate-500 mb-2">
        실행 전 3일 vs 실행 후 7일 일평균 매출 비교 (POS·일마감)
      </p>
      <div className="space-y-1.5 max-h-40 overflow-y-auto">
        {actions.slice(0, 5).map(action => (
          <ActionAttributionRow key={action.id} action={action} />
        ))}
      </div>
    </div>
  );
}
