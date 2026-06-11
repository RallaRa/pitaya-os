'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Grid3X3 } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import SalesHeatmapGrid, { HeatmapInsightsList } from '@/components/analytics/SalesHeatmapGrid';
import HeatmapCellDetailPanel from '@/components/analytics/HeatmapCellDetailPanel';
import type { HeatmapCell, HeatmapCellDetail, HeatmapInsight, HeatmapRange } from '@/lib/salesHeatmapCalc';

const RANGE_OPTIONS: { value: HeatmapRange; label: string }[] = [
  { value: '1m', label: '최근 1개월' },
  { value: '3m', label: '최근 3개월' },
  { value: '6m', label: '최근 6개월' },
];

export default function SalesHeatmapPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [range, setRange] = useState<HeatmapRange>('1m');
  const [cells, setCells] = useState<HeatmapCell[][]>([]);
  const [insights, setInsights] = useState<HeatmapInsight[]>([]);
  const [meta, setMeta] = useState<{ startDate: string; endDate: string; daysProcessed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<{ dow: number; hour: number } | null>(null);
  const [detail, setDetail] = useState<HeatmapCellDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/sales-heatmap?storeId=${encodeURIComponent(storeId)}&range=${range}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setCells(d.cells || []);
      setInsights(d.insights || []);
      setMeta({ startDate: d.startDate, endDate: d.endDate, daysProcessed: d.daysProcessed });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '히트맵 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId, range]);

  useEffect(() => { load(); }, [load]);

  const openCell = useCallback(async (dow: number, hour: number) => {
    if (!storeId) return;
    setSelected({ dow, hour });
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/sales-heatmap?storeId=${encodeURIComponent(storeId)}&range=${range}&dow=${dow}&hour=${hour}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '상세 조회 실패');
      setDetail(d.detail);
    } catch {
      setDetail(null);
    } finally {
      setDetailLoading(false);
    }
  }, [storeId, range]);

  const closeDetail = () => {
    setSelected(null);
    setDetail(null);
  };

  if (!storeId) {
    return (
      <div className="min-h-full bg-slate-950 p-6 text-slate-400 text-sm">
        매장을 선택해 주세요.
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 relative">
      <div className="max-w-6xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard" className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1 min-w-0">
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Grid3X3 className="w-5 h-5 text-teal-400" />
              시간대별 수익 히트맵
            </h1>
            {meta && (
              <p className="text-xs text-slate-500 mt-0.5">
                {meta.startDate} ~ {meta.endDate} · {meta.daysProcessed}일 분석
              </p>
            )}
          </div>
          <button
            type="button"
            onClick={load}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {RANGE_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRange(opt.value)}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                range === opt.value
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">
            {error}
          </p>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
          </div>
        ) : (
          <>
            <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">인사이트</p>
              <HeatmapInsightsList insights={insights} />
            </section>

            <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  요일 × 시간대 (평균 매출)
                </p>
                <div className="flex items-center gap-3 text-[10px] text-slate-500">
                  <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-teal-400/85 inline-block" /> 높음</span>
                  <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-slate-600 inline-block" /> 보통</span>
                  <span className="flex items-center gap-1"><i className="w-3 h-3 rounded-sm bg-slate-800 inline-block" /> 낮음</span>
                </div>
              </div>
              <SalesHeatmapGrid
                cells={cells}
                onCellClick={openCell}
                selected={selected}
              />
              <p className="text-[10px] text-slate-600">셀 클릭 → 해당 시간대 상세 통계</p>
            </section>
          </>
        )}
      </div>

      {(detail || detailLoading) && (
        <>
          <button
            type="button"
            className="fixed inset-0 bg-black/40 z-40"
            onClick={closeDetail}
            aria-label="닫기"
          />
          {detailLoading && !detail ? (
            <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-slate-900 border-l border-slate-800 z-50 flex items-center justify-center">
              <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
            </div>
          ) : detail ? (
            <HeatmapCellDetailPanel detail={detail} onClose={closeDetail} />
          ) : null}
        </>
      )}
    </div>
  );
}
