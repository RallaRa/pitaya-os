'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { TrendingUp, TrendingDown, Minus, Target, Settings } from 'lucide-react';
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

export default function SalesCompareWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<SalesCompareData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/sales-compare?storeId=${storeId}`, {
        headers: await getAuthHeaders(),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || `HTTP ${res.status}`);
      setData(d);
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '매출 목표 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

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

        {/* 전기간 대비 (보조) */}
        <div className="border-t border-slate-700/40 pt-2 flex items-center justify-between text-[9px] text-slate-500">
          <span>전{kind === 'week' ? '주' : '월'} 대비</span>
          <DiffBadge pct={pct} />
          <span className="text-slate-600">{fmt(block.previous.net)}원</span>
        </div>
      </div>
    );
  };

  const meta = data?.targetsMeta;

  return (
    <WidgetWrapper
      title="🎯 매출 목표"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3">
          <WidgetEmptyReason reason="매장이 선택되지 않았습니다." />
        </div>
      ) : data ? (
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
          {data.emptyReason && <WidgetEmptyReason reason={data.emptyReason} />}
          <TargetBlockView block={data.week} label="주간" kind="week" />
          <TargetBlockView block={data.month} label="월간" kind="month" />
        </div>
      ) : !loading && !error ? (
        <p className="text-slate-500 text-xs text-center mt-4">매출 데이터 없음</p>
      ) : null}
    </WidgetWrapper>
  );
}
