'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import EmptyState from '@/components/suspense/EmptyState';
import SkeletonCard from '@/components/suspense/SkeletonCard';
import { useSalesCompare } from '@/lib/queries';
import { TrendingUp, TrendingDown, Minus, Target, Settings } from 'lucide-react';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';
import type { TargetProgressResult } from '@/lib/salesTargets';

interface PeriodStat { label: string; net: number; total: number; customers: number; }
interface TargetBlock {
  sales: number;
  customers: number;
  progress: TargetProgressResult;
}
interface CompareBlock {
  current: PeriodStat;
  previous: PeriodStat;
  pct: number | null;
  target: TargetBlock;
}
interface TargetsMeta {
  todayYm: string;
  activePeriod: { startYm: string; endYm: string } | null;
  previousPeriod: { startYm: string; endYm: string } | null;
  hasMonthTarget: boolean;
}
interface SalesCompareData {
  week: CompareBlock;
  month: CompareBlock;
  targetsMeta: TargetsMeta;
  emptyReason?: string | null;
}

function SalesCompareWidgetContent({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId: string;
}) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useSalesCompare(storeId);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());

  useEffect(() => {
    if (dataUpdatedAt) setUpdatedAt(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const analysis = useWidgetAnalysis('sales_compare', storeId, data);

  if (isLoading && !data) {
    return (
      <WidgetWrapper title="🎯 매출 목표" editMode={editMode} onRemove={onRemove}>
        <div className="p-3"><SkeletonCard /></div>
      </WidgetWrapper>
    );
  }

  if (isError || !data) {
    return (
      <WidgetWrapper title="🎯 매출 목표" editMode={editMode} onRemove={onRemove} onRefresh={refresh}>
        <div className="p-3"><EmptyState reason="매출 목표 데이터를 불러오지 못했습니다." /></div>
      </WidgetWrapper>
    );
  }

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const DiffBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-slate-500 text-[10px]">비교 불가</span>;
    const color  = pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-slate-400';
    const Icon   = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${color}`}>
        <Icon className="w-3.5 h-3.5" />
        {pct > 0 ? '+' : ''}{pct}%
      </span>
    );
  };

  const PaceBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return null;
    const color = pct >= 100 ? 'text-emerald-400' : pct >= 80 ? 'text-amber-400' : 'text-red-400';
    return (
      <span className={`text-[9px] ${color}`}>
        진도율 {pct}%
      </span>
    );
  };

  const AchievementPanel = ({
    prog,
    kind,
    hasSalesTarget,
    hasCustomersTarget,
  }: {
    prog: TargetProgressResult;
    kind: 'week' | 'month';
    hasSalesTarget: boolean;
    hasCustomersTarget: boolean;
  }) => {
    if (!hasSalesTarget && !hasCustomersTarget) return null;
    if (prog.achievementLikelihoodPct == null) return null;

    const statusLabel = {
      achieved: '목표 달성',
      on_track: '달성 가능',
      at_risk: '주의 필요',
      unlikely: '달성 어려움',
    }[prog.achievementStatus || 'at_risk'] || '';

    const statusColor = {
      achieved: 'text-teal-400 border-teal-500/40 bg-teal-950/30',
      on_track: 'text-teal-300 border-teal-500/30 bg-teal-950/20',
      at_risk: 'text-amber-300 border-amber-500/30 bg-amber-950/20',
      unlikely: 'text-red-300 border-red-500/40 bg-red-950/20',
    }[prog.achievementStatus || 'at_risk'] || 'text-slate-300';

    const periodLabel = kind === 'month' ? '월말' : '주말';

    return (
      <div className={`rounded-lg border px-2.5 py-2 space-y-1.5 ${statusColor}`}>
        <div className="flex items-center justify-between gap-2">
          <span className="text-[10px] font-semibold">
            {kind === 'month' ? '당월' : '이번 주'} 달성 가능성
          </span>
          <span className="text-xs font-bold tabular-nums">
            {prog.achievementLikelihoodPct}%
          </span>
        </div>
        <p className="text-[9px] opacity-90">{statusLabel} · 현재 페이스 기준</p>

        {prog.achievementStatus !== 'achieved' && prog.daysRemaining > 0 && (
          <div className="text-[10px] space-y-0.5 pt-0.5 border-t border-white/10">
            <p>
              남은 <strong>{prog.daysRemaining}일</strong> · 일별 필요
            </p>
            {hasSalesTarget && prog.dailySalesNeeded > 0 && (
              <p className="tabular-nums">
                매출 <strong className="text-white">{fmt(prog.dailySalesNeeded)}</strong>원/일
                <span className="text-slate-500 ml-1">(잔여 {fmt(prog.remainingSales)}원)</span>
              </p>
            )}
            {hasCustomersTarget && prog.dailyCustomersNeeded > 0 && (
              <p className="tabular-nums">
                객수 <strong className="text-white">{fmt(prog.dailyCustomersNeeded)}</strong>명/일
                <span className="text-slate-500 ml-1">(잔여 {fmt(prog.remainingCustomers)}명)</span>
              </p>
            )}
          </div>
        )}

        {prog.achievementStatus === 'achieved' && (
          <p className="text-[10px]">🎉 목표 달성 — 현재 페이스 유지</p>
        )}

        {(hasSalesTarget || hasCustomersTarget) && (
          <p className="text-[9px] text-slate-500 pt-0.5">
            {periodLabel} 예상
            {hasSalesTarget && <> 매출 {fmt(prog.projectedSales)}원</>}
            {hasSalesTarget && hasCustomersTarget && ' · '}
            {hasCustomersTarget && <> 객수 {fmt(prog.projectedCustomers)}명</>}
          </p>
        )}
      </div>
    );
  };

  const TargetBlockView = ({
    block,
    label,
    kind,
  }: {
    block: CompareBlock;
    label: string;
    kind: 'week' | 'month';
  }) => {
    const { current, target, pct } = block;
    const prog = target.progress;
    const hasTarget = target.sales > 0 || target.customers > 0;
    const hasSalesTarget = target.sales > 0;
    const hasCustomersTarget = target.customers > 0;

    return (
      <div className="bg-slate-800/50 rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <span className="text-slate-400 text-xs font-semibold flex items-center gap-1">
            <Target className="w-3 h-3 text-amber-400" />
            {label}
          </span>
          {hasTarget ? (
            <span className="text-[9px] text-amber-400/90">목표 기준</span>
          ) : (
            <Link
              href="/dashboard/settings/sales-targets"
              className="text-[9px] text-teal-400 hover:text-teal-300 flex items-center gap-0.5"
            >
              <Settings className="w-2.5 h-2.5" /> 목표 설정
            </Link>
          )}
        </div>

        <p className="text-[9px] text-slate-500">{current.label}</p>

        {/* 매출 */}
        <div className="space-y-1">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">매출 (순매출)</p>
          <p className="text-white font-bold text-sm">
            {fmt(current.net)}<span className="text-slate-500 text-[10px] ml-0.5">원</span>
          </p>
          {hasTarget && (
            <div className="text-[10px] text-slate-400 space-y-0.5">
              <p>목표 {fmt(target.sales)}원 · 달성율 {prog.salesPct ?? '-'}%</p>
              <PaceBadge pct={prog.salesPacePct} />
            </div>
          )}
        </div>

        {/* 객수 */}
        <div className="space-y-1 border-t border-slate-700/50 pt-2">
          <p className="text-[9px] text-slate-500 uppercase tracking-wider">객수</p>
          <p className="text-slate-200 text-xs">
            총 <strong className="text-white">{fmt(current.customers)}</strong>명
            <span className="text-slate-500 mx-1">·</span>
            일평균 <strong className="text-teal-300">{prog.avgDailyCustomers}</strong>명/일
            <span className="text-slate-600 text-[9px]"> ({prog.daysElapsed}일)</span>
          </p>
          {hasTarget && (
            <div className="text-[10px] text-slate-400 space-y-0.5">
              <p>
                목표 총 {fmt(target.customers)}명 · 일평균 {prog.targetDailyCustomers}명
              </p>
              <p className="flex flex-wrap gap-1 items-center">
                <span>달성율 {prog.customersPct ?? '-'}%</span>
                <PaceBadge pct={prog.customersPacePct} />
              </p>
            </div>
          )}
        </div>

        {hasTarget && target.sales > 0 && (
          <div className="h-1.5 bg-slate-700/50 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, prog.salesPct ?? 0)}%` }}
            />
          </div>
        )}

        {hasTarget && (
          <AchievementPanel
            prog={prog}
            kind={kind}
            hasSalesTarget={hasSalesTarget}
            hasCustomersTarget={hasCustomersTarget}
          />
        )}

        {/* 전기간 대비 (보조) */}
        <div className="border-t border-slate-700/40 pt-2 flex items-center justify-between text-[9px] text-slate-500">
          <span>전{kind === 'week' ? '주' : '월'} 대비</span>
          <DiffBadge pct={pct} />
          <span className="text-slate-600">{fmt(block.previous.net)}원</span>
        </div>
      </div>
    );
  };

  const meta = data.targetsMeta as TargetsMeta | undefined;

  return (
    <WidgetWrapper
      title="🎯 매출 목표"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      {data ? (
        <div className="h-full overflow-y-auto p-3 space-y-3">
          {meta?.activePeriod && (
            <div className="text-[9px] text-slate-500 bg-slate-800/40 rounded-lg px-2 py-1.5 leading-relaxed">
              적용 목표 기간: <span className="text-slate-300">{meta.activePeriod.startYm} ~ {meta.activePeriod.endYm}</span>
              {meta.previousPeriod && (
                <> · 직전 기간: {meta.previousPeriod.startYm} ~ {meta.previousPeriod.endYm}</>
              )}
              {!meta.hasMonthTarget && (
                <span className="text-amber-400 block mt-0.5">이번 달({meta.todayYm}) 목표 미등록 — 설정에서 입력하세요</span>
              )}
            </div>
          )}
          {data.emptyReason && <EmptyState reason={data.emptyReason} />}
          <TargetBlockView block={data.week as CompareBlock} label="주간" kind="week" />
          <TargetBlockView block={data.month as CompareBlock} label="월간" kind="month" />
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : (
        <p className="text-slate-500 text-xs text-center mt-4">매출 데이터 없음</p>
      )}
    </WidgetWrapper>
  );
}

export default function SalesCompareWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  if (!storeId) {
    return (
      <WidgetWrapper title="🎯 매출 목표" editMode={editMode} onRemove={onRemove}>
        <div className="p-3">
          <EmptyState reason="매장이 선택되지 않았습니다." />
        </div>
      </WidgetWrapper>
    );
  }

  return <SalesCompareWidgetContent editMode={editMode} onRemove={onRemove} storeId={storeId} />;
}
