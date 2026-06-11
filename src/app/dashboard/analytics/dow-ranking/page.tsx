'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ArrowLeft, Loader2, RefreshCw, Trophy } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import DowProfitabilityChart from '@/components/analytics/DowProfitabilityChart';
import {
  DOW_PERIOD_LABELS,
  formatManwon,
  type DowPeriod,
  type DowProfitDetail,
  type DowProfitInsight,
  type DowProfitRow,
} from '@/lib/dowProfitabilityCalc';

const PERIOD_OPTIONS: DowPeriod[] = ['week', 'month', 'quarter'];

export default function DowRankingPage() {
  const searchParams = useSearchParams();
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const initialPeriod = (searchParams.get('period') || 'month') as DowPeriod;
  const initialDow = searchParams.get('dow');

  const [period, setPeriod] = useState<DowPeriod>(
    ['week', 'month', 'quarter'].includes(initialPeriod) ? initialPeriod : 'month',
  );
  const [rows, setRows] = useState<DowProfitRow[]>([]);
  const [insights, setInsights] = useState<DowProfitInsight[]>([]);
  const [meta, setMeta] = useState<{ startDate: string; endDate: string; daysProcessed: number } | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [selectedDow, setSelectedDow] = useState<number | null>(null);
  const [detail, setDetail] = useState<DowProfitDetail | null>(null);
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
        `/api/dashboard/dow-profitability?storeId=${encodeURIComponent(storeId)}&period=${period}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setRows(d.rows || []);
      setInsights(d.insights || []);
      setMeta({ startDate: d.startDate, endDate: d.endDate, daysProcessed: d.daysProcessed });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  const openDow = useCallback(async (dow: number) => {
    if (!storeId) return;
    setSelectedDow(dow);
    setDetailLoading(true);
    try {
      const res = await fetch(
        `/api/dashboard/dow-profitability?storeId=${encodeURIComponent(storeId)}&period=${period}&dow=${dow}`,
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
  }, [storeId, period]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (initialDow != null && storeId && rows.length > 0) {
      const dow = Number(initialDow);
      if (dow >= 0 && dow <= 6) openDow(dow);
    }
  }, [initialDow, storeId, rows.length, openDow]);

  if (!storeId) {
    return (
      <div className="min-h-full bg-slate-950 p-6 text-slate-400 text-sm">매장을 선택해 주세요.</div>
    );
  }

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 relative">
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-5">
        <div className="flex items-center gap-3 flex-wrap">
          <Link href="/dashboard" className="p-2 rounded-lg bg-slate-800/60 hover:bg-slate-800 text-slate-400">
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-slate-100 flex items-center gap-2">
              <Trophy className="w-5 h-5 text-teal-400" />
              요일별 수익성 랭킹
            </h1>
            {meta && (
              <p className="text-xs text-slate-500 mt-0.5">
                {meta.startDate} ~ {meta.endDate} · {meta.daysProcessed}일 분석
              </p>
            )}
          </div>
          <button type="button" onClick={load} className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400">
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="flex gap-2">
          {PERIOD_OPTIONS.map(p => (
            <button
              key={p}
              type="button"
              onClick={() => { setPeriod(p); setSelectedDow(null); setDetail(null); }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                period === p
                  ? 'bg-teal-600/30 text-teal-300 border border-teal-500/40'
                  : 'bg-slate-800 text-slate-400 border border-slate-700'
              }`}
            >
              {DOW_PERIOD_LABELS[p]}
            </button>
          ))}
        </div>

        {error && (
          <p className="text-red-400 text-sm bg-red-950/30 border border-red-900/40 rounded-lg px-3 py-2">{error}</p>
        )}

        {loading ? (
          <div className="flex justify-center py-20">
            <Loader2 className="w-7 h-7 animate-spin text-teal-400" />
          </div>
        ) : (
          <>
            {insights.length > 0 && (
              <section className="space-y-2">
                {insights.map((ins, i) => (
                  <p
                    key={i}
                    className={`text-xs rounded-lg px-3 py-2 border ${
                      ins.type === 'low'
                        ? 'text-amber-300/90 bg-amber-950/20 border-amber-900/30'
                        : 'text-teal-300/90 bg-teal-950/30 border-teal-900/30'
                    }`}
                  >
                    💡 {ins.text}
                  </p>
                ))}
              </section>
            )}

            <section className="bg-slate-900/50 border border-slate-800 rounded-xl p-4">
              <p className="text-xs text-slate-500 mb-3">요일별 추정 수익 (바 클릭 → 상세)</p>
              <DowProfitabilityChart
                rows={rows}
                selectedDow={selectedDow}
                onBarClick={openDow}
              />
            </section>

            <section className="bg-slate-900/50 border border-slate-800 rounded-xl overflow-hidden">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-slate-500 border-b border-slate-800">
                    <th className="text-left px-4 py-2">순위</th>
                    <th className="text-left px-2 py-2">요일</th>
                    <th className="text-right px-2 py-2">평균 매출</th>
                    <th className="text-right px-2 py-2">평균 객수</th>
                    <th className="text-right px-2 py-2">객단가</th>
                    <th className="text-right px-2 py-2">추정 원가</th>
                    <th className="text-right px-4 py-2">추정 수익</th>
                  </tr>
                </thead>
                <tbody>
                  {[...rows].sort((a, b) => a.rank - b.rank).map(r => (
                    <tr
                      key={r.dow}
                      onClick={() => openDow(r.dow)}
                      className={`border-b border-slate-800/60 cursor-pointer hover:bg-slate-800/40 ${
                        selectedDow === r.dow ? 'bg-teal-950/30' : ''
                      }`}
                    >
                      <td className="px-4 py-2.5 text-teal-400 font-bold">{r.rank}</td>
                      <td className="px-2 py-2.5 text-slate-200">{r.dowLabel}</td>
                      <td className="px-2 py-2.5 text-right text-slate-300">{formatManwon(r.avgSales)}</td>
                      <td className="px-2 py-2.5 text-right text-slate-300">{r.avgCustomers}명</td>
                      <td className="px-2 py-2.5 text-right text-slate-300">{r.avgTicket.toLocaleString()}원</td>
                      <td className="px-2 py-2.5 text-right text-slate-400">
                        {formatManwon(r.avgEstCost)}
                        {r.profitIsEstimated && <span className="text-[9px] text-slate-600 ml-0.5">추정</span>}
                      </td>
                      <td className="px-4 py-2.5 text-right text-teal-300 font-semibold">{formatManwon(r.avgEstProfit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}
      </div>

      {(detail || detailLoading) && (
        <>
          <button type="button" className="fixed inset-0 bg-black/40 z-40" onClick={() => { setSelectedDow(null); setDetail(null); }} aria-label="닫기" />
          <div className="fixed inset-y-0 right-0 w-full max-w-sm bg-slate-900 border-l border-slate-800 z-50 flex flex-col">
            {detailLoading && !detail ? (
              <div className="flex-1 flex items-center justify-center">
                <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
              </div>
            ) : detail ? (
              <>
                <div className="px-4 py-3 border-b border-slate-800">
                  <h3 className="text-sm font-semibold">{detail.dowLabel}요일 상세 · {DOW_PERIOD_LABELS[period]}</h3>
                  <p className="text-[10px] text-slate-500 mt-0.5">{detail.rank}위 · {detail.dayCount}일 표본</p>
                </div>
                <div className="flex-1 overflow-y-auto p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-2 gap-2">
                    <Stat label="평균 매출" value={formatManwon(detail.avgSales)} />
                    <Stat label="추정 수익" value={formatManwon(detail.avgEstProfit)} highlight />
                    <Stat label="평균 객수" value={`${detail.avgCustomers}명`} />
                    <Stat label="객단가" value={`${detail.avgTicket.toLocaleString()}원`} />
                    <Stat label="추정 원가" value={`${formatManwon(detail.avgEstCost)}${detail.profitIsEstimated ? ' (추정)' : ''}`} />
                    <Stat label="수익률" value={`${detail.profitMargin}%`} />
                  </div>
                  <div>
                    <p className="text-slate-500 mb-2">일별 실적</p>
                    <ul className="space-y-1">
                      {detail.dates.map(d => (
                        <li key={d.date} className="flex justify-between bg-slate-800/40 rounded-lg px-3 py-2">
                          <span className="text-slate-400">{d.date}</span>
                          <span className="text-slate-200">{formatManwon(d.netSales)} · {d.customers}명</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </>
            ) : null}
          </div>
        </>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="bg-slate-800/40 rounded-lg p-2.5">
      <p className="text-[10px] text-slate-500">{label}</p>
      <p className={`font-semibold mt-0.5 ${highlight ? 'text-teal-300' : 'text-slate-200'}`}>{value}</p>
    </div>
  );
}
