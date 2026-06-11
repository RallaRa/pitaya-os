'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import DowProfitabilityChart from '@/components/analytics/DowProfitabilityChart';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { DowPeriod, DowProfitInsight, DowProfitRow } from '@/lib/dowProfitabilityCalc';
import { DOW_PERIOD_LABELS } from '@/lib/dowProfitabilityCalc';
import { ArrowRight } from 'lucide-react';

export default function DowProfitabilityWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [period, setPeriod] = useState<DowPeriod>('month');
  const [rows, setRows] = useState<DowProfitRow[]>([]);
  const [insights, setInsights] = useState<DowProfitInsight[]>([]);
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
        `/api/dashboard/dow-profitability?storeId=${encodeURIComponent(storeId)}&period=${period}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setRows(d.rows || []);
      setInsights((d.insights || []).slice(0, 1));
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '랭킹 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  useEffect(() => { load(); }, [load]);

  return (
    <WidgetWrapper
      title="🏆 요일별 수익성"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : rows.length > 0 ? (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex gap-1">
            {(['week', 'month', 'quarter'] as DowPeriod[]).map(p => (
              <button
                key={p}
                type="button"
                onClick={() => setPeriod(p)}
                className={`px-2 py-0.5 rounded text-[9px] ${
                  period === p ? 'bg-teal-700/40 text-teal-300' : 'bg-slate-800 text-slate-500'
                }`}
              >
                {DOW_PERIOD_LABELS[p]}
              </button>
            ))}
          </div>

          {insights[0] && (
            <p className="text-[10px] text-amber-300/80 leading-snug">{insights[0].text}</p>
          )}

          <div className="flex gap-2 text-[10px] overflow-x-auto pb-1">
            {[...rows].sort((a, b) => a.rank - b.rank).map(r => (
              <Link
                key={r.dow}
                href={`/dashboard/analytics/dow-ranking?dow=${r.dow}&period=${period}`}
                className={`shrink-0 px-2 py-1 rounded-lg border ${
                  r.rank === 1
                    ? 'border-teal-500/40 bg-teal-950/40 text-teal-300'
                    : 'border-slate-700 bg-slate-800/50 text-slate-400'
                }`}
              >
                {r.rank}. {r.dowLabel}
              </Link>
            ))}
          </div>

          <div className="flex-1 min-h-0">
            <DowProfitabilityChart rows={rows} compact />
          </div>

          <Link
            href="/dashboard/analytics/dow-ranking"
            className="flex items-center justify-center gap-1 text-[10px] text-teal-400 hover:text-teal-300"
          >
            상세 분석 <ArrowRight className="w-3 h-3" />
          </Link>
        </div>
      ) : !loading && !error ? (
        <p className="text-slate-500 text-xs text-center p-3">매출 데이터 없음</p>
      ) : null}
    </WidgetWrapper>
  );
}
