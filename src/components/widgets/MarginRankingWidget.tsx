'use client';

import Link from 'next/link';
import { ArrowRight, TrendingDown, TrendingUp } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { useMarginRanking } from '@/lib/queries';
import { formatMarginPct, type MarginInsight, type MarginItemRow } from '@/lib/marginRankingShared';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface MarginData {
  avgMargin: number | null;
  globalTargetMargin: number;
  achievementRate: number | null;
  top10: MarginItemRow[];
  bottom5: MarginItemRow[];
  insights: MarginInsight[];
}

function MarginGauge({ value, target }: { value: number | null; target: number }) {
  const pct = value != null ? Math.min(100, Math.max(0, value * 100)) : 0;
  const targetPct = target * 100;
  const met = value != null && value >= target - 0.01;
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-500">평균 마진율</span>
        <span className={met ? 'text-teal-400' : 'text-slate-400'}>
          {value != null ? formatMarginPct(value) : '—'}
        </span>
      </div>
      <div className="h-2 rounded-full bg-slate-800 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${met ? 'bg-teal-500' : 'bg-slate-500'}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-amber-400/80"
          style={{ left: `${Math.min(100, targetPct)}%` }}
          title={`목표 ${targetPct.toFixed(0)}%`}
        />
      </div>
      <p className="text-[9px] text-slate-600">목표 {targetPct.toFixed(0)}%</p>
    </div>
  );
}

export default function MarginRankingWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const { data: rawData, isLoading, isError, refetch, dataUpdatedAt, error } = useMarginRanking(storeId || '', !!storeId);
  const data = rawData as MarginData | undefined;
  const updatedAt = dataUpdatedAt ? new Date(dataUpdatedAt) : null;
  const top5 = data?.top10.slice(0, 5) || [];
  const bottom3 = data?.bottom5.slice(0, 3) || [];
  const analysis = useWidgetAnalysis('margin_ranking', storeId || undefined, data);

  return (
    <WidgetWrapper
      title="📊 마진율 랭킹"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={() => void refetch()}
      updatedAt={updatedAt}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '마진 데이터를 불러오지 못했습니다') : null}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : !data?.top10.length && !isLoading ? (
        <div className="p-3"><WidgetEmptyReason reason="마진 계산 가능한 품목이 없습니다." /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <MarginGauge value={data.avgMargin} target={data.globalTargetMargin} />

          {data.achievementRate != null && (
            <p className="text-[10px] text-slate-500">
              목표 달성 품목 <span className="text-teal-400">{(data.achievementRate * 100).toFixed(0)}%</span>
            </p>
          )}

          {data.insights[0] && (
            <p className="text-[10px] text-amber-300/80 leading-snug line-clamp-2">{data.insights[0].text}</p>
          )}

          <div className="flex-1 min-h-0 grid grid-cols-2 gap-2 text-[10px] overflow-hidden">
            <div className="min-h-0 overflow-y-auto">
              <p className="text-teal-400/80 flex items-center gap-0.5 mb-1 sticky top-0 bg-slate-950/90">
                <TrendingUp className="w-3 h-3" /> TOP
              </p>
              <ul className="space-y-0.5">
                {top5.map(r => (
                  <li key={r.id} className="flex justify-between gap-1 text-slate-300">
                    <span className="truncate">{r.rank}. {r.name}{r.isEstimated ? ' ※' : ''}</span>
                    <span className="text-teal-400 shrink-0">{formatMarginPct(r.marginRate)}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="min-h-0 overflow-y-auto">
              <p className="text-rose-400/80 flex items-center gap-0.5 mb-1 sticky top-0 bg-slate-950/90">
                <TrendingDown className="w-3 h-3" /> BOTTOM
              </p>
              <ul className="space-y-0.5">
                {bottom3.map(r => (
                  <li key={r.id} className="flex justify-between gap-1 text-slate-400">
                    <span className="truncate">{r.name}{r.isEstimated ? ' ※' : ''}</span>
                    <span className="text-rose-400 shrink-0">{formatMarginPct(r.marginRate)}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <Link
            href="/dashboard/analytics/margin"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300 shrink-0"
          >
            전체 랭킹 <ArrowRight className="w-3 h-3" />
          </Link>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
