'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Target, CheckCircle2 } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { formatManwonShort } from '@/lib/breakEvenCalc';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface BreakEvenData {
  date: string;
  fixedCostsTotal: number;
  variableCostRatio: number;
  marginRate: number;
  monthlyBep: number;
  businessDays: number;
  todayBepTarget: number;
  todayNetSales: number;
  progressPct: number;
  remainingAmount: number;
  achieved: boolean;
  monthKey: string;
}

function BepGauge({ progressPct, achieved }: { progressPct: number; achieved: boolean }) {
  const pct = Math.min(100, Math.max(0, progressPct));
  return (
    <div className="space-y-1.5">
      <div className="flex justify-between text-[10px]">
        <span className="text-slate-500">오늘 BEP 달성률</span>
        <span className={achieved ? 'text-teal-400 font-semibold' : 'text-slate-400'}>
          {pct.toFixed(1)}%
        </span>
      </div>
      <div className="h-3 rounded-full bg-slate-800 overflow-hidden relative">
        <div
          className={`h-full rounded-full transition-all ${achieved ? 'bg-teal-500' : 'bg-slate-500'}`}
          style={{ width: `${pct}%` }}
        />
        <div
          className="absolute top-0 bottom-0 w-0.5 bg-teal-300/90"
          style={{ left: '100%', transform: 'translateX(-1px)' }}
          title="100% BEP"
        />
      </div>
      {achieved && (
        <p className="text-[9px] text-teal-400 flex items-center gap-1">
          <CheckCircle2 className="w-3 h-3" /> 오늘 손익분기점 달성
        </p>
      )}
    </div>
  );
}

export default function BreakEvenWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data, setData] = useState<BreakEvenData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/break-even?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setData(d);
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '손익분기 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);
  const analysis = useWidgetAnalysis('break_even', storeId, data ? {
    progressPct: data.progressPct,
    achieved: data.achieved,
    remainingAmount: data.remainingAmount,
    todayBepTarget: data.todayBepTarget,
  } : undefined);

  return (
    <WidgetWrapper
      title="🎯 실시간 손익분기"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : !data && !loading ? (
        <div className="p-3"><WidgetEmptyReason reason="손익분기 데이터가 없습니다." /></div>
      ) : data ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-slate-500 flex items-center gap-1">
              <Target className="w-3 h-3" />
              {data.monthKey} · 영업일 {data.businessDays}일
            </span>
            <Link
              href="/dashboard/analytics/break-even"
              className="text-teal-400 hover:text-teal-300 flex items-center gap-0.5"
            >
              상세 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>

          <BepGauge progressPct={data.progressPct} achieved={data.achieved} />

          <div className="grid grid-cols-2 gap-2 text-[10px] mt-1">
            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-2">
              <p className="text-slate-500">오늘 목표</p>
              <p className="text-slate-200 font-medium tabular-nums">
                {formatManwonShort(data.todayBepTarget)}
              </p>
            </div>
            <div className="rounded-lg bg-slate-800/60 border border-slate-700/50 p-2">
              <p className="text-slate-500">오늘 매출</p>
              <p className={`font-medium tabular-nums ${data.achieved ? 'text-teal-400' : 'text-slate-200'}`}>
                {formatManwonShort(data.todayNetSales)}
              </p>
            </div>
          </div>

          {!data.achieved && data.remainingAmount > 0 && (
            <p className="text-[10px] text-amber-400/90">
              BEP까지 {formatManwonShort(data.remainingAmount)} 남음
            </p>
          )}

          <p className="text-[9px] text-slate-600 mt-auto">
            월 BEP {formatManwonShort(data.monthlyBep)} · 원가율 {(data.variableCostRatio * 100).toFixed(0)}%
          </p>
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      ) : null}
    </WidgetWrapper>
  );
}
