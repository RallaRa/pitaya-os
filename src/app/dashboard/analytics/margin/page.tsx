'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, RefreshCw, Settings, TrendingDown, TrendingUp } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { formatMarginPct, type MarginInsight, type MarginItemRow } from '@/lib/marginRankingShared';

export default function MarginRankingPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';

  const [all, setAll] = useState<MarginItemRow[]>([]);
  const [avgMargin, setAvgMargin] = useState<number | null>(null);
  const [globalTarget, setGlobalTarget] = useState(0.35);
  const [achievementRate, setAchievementRate] = useState<number | null>(null);
  const [insights, setInsights] = useState<MarginInsight[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tab, setTab] = useState<'all' | 'top' | 'bottom'>('all');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/dashboard/margin-ranking?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setAll(d.all || []);
      setAvgMargin(d.avgMargin ?? null);
      setGlobalTarget(d.globalTargetMargin ?? 0.35);
      setAchievementRate(d.achievementRate ?? null);
      setInsights(d.insights || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const displayRows = tab === 'top'
    ? all.slice(0, 10)
    : tab === 'bottom'
      ? [...all].sort((a, b) => a.marginRate - b.marginRate).slice(0, 5)
      : all;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 p-4 md:p-6">
      <div className="max-w-4xl mx-auto space-y-4">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-white"
          >
            <ArrowLeft className="w-4 h-4" />
          </Link>
          <div className="flex-1">
            <h1 className="text-lg font-bold text-white">마진율 랭킹</h1>
            <p className="text-xs text-slate-500">(판매가 − 매입단가) ÷ 판매가 · ※ 중량 품목 추정</p>
          </div>
          <Link
            href="/dashboard/settings/margin-targets"
            className="p-2 rounded-lg bg-slate-900 border border-slate-800 text-slate-400 hover:text-teal-400"
            title="목표 설정"
          >
            <Settings className="w-4 h-4" />
          </Link>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">평균 마진율</p>
            <p className={`text-2xl font-bold ${avgMargin != null && avgMargin >= globalTarget ? 'text-teal-400' : 'text-slate-300'}`}>
              {avgMargin != null ? formatMarginPct(avgMargin) : '—'}
            </p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">목표 마진율</p>
            <p className="text-2xl font-bold text-amber-400">{formatMarginPct(globalTarget)}</p>
          </div>
          <div className="p-4 rounded-xl bg-slate-900 border border-slate-800">
            <p className="text-[10px] text-slate-500">목표 달성률</p>
            <p className="text-2xl font-bold text-teal-400">
              {achievementRate != null ? `${(achievementRate * 100).toFixed(0)}%` : '—'}
            </p>
          </div>
        </div>

        {insights.length > 0 && (
          <div className="space-y-1.5">
            {insights.map((ins, i) => (
              <p key={i} className="text-xs text-amber-300/90 bg-amber-950/20 border border-amber-900/30 rounded-lg px-3 py-2">
                {ins.text}
              </p>
            ))}
          </div>
        )}

        {error && (
          <p className="text-xs text-rose-400 bg-rose-950/30 border border-rose-800/40 rounded-lg px-3 py-2">{error}</p>
        )}

        <div className="flex gap-1 p-1 rounded-lg bg-slate-900 border border-slate-800 w-fit">
          {([
            ['all', '전체'],
            ['top', 'TOP10'],
            ['bottom', 'BOTTOM5'],
          ] as const).map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTab(k)}
              className={`px-3 py-1.5 rounded-md text-xs ${
                tab === k ? 'bg-slate-800 text-white' : 'text-slate-500'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
          </div>
        ) : displayRows.length === 0 ? (
          <p className="text-center text-slate-500 py-16">품목 데이터 없음</p>
        ) : (
          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead>
                <tr className="bg-slate-900 text-slate-500 text-left">
                  <th className="px-3 py-2">#</th>
                  <th className="px-3 py-2">품목</th>
                  <th className="px-3 py-2 text-right">매입</th>
                  <th className="px-3 py-2 text-right">판매</th>
                  <th className="px-3 py-2 text-right">마진율</th>
                  <th className="px-3 py-2 text-right">목표</th>
                  <th className="px-3 py-2 text-right">달성</th>
                </tr>
              </thead>
              <tbody>
                {displayRows.map(row => (
                  <tr key={row.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-slate-600">{row.rank}</td>
                    <td className="px-3 py-2">
                      <Link href="/dashboard/items" className="text-slate-200 hover:text-teal-300">
                        {row.name}
                      </Link>
                      {row.isEstimated && <span className="text-[9px] text-amber-500 ml-1">추정</span>}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {row.buyPrice.toLocaleString()}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-400">
                      {row.sellPrice.toLocaleString()}
                    </td>
                    <td className={`px-3 py-2 text-right tabular-nums font-medium ${
                      row.marginRate >= globalTarget ? 'text-teal-400' : 'text-rose-400'
                    }`}>
                      {formatMarginPct(row.marginRate)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-slate-500">
                      {formatMarginPct(row.targetMargin)}
                    </td>
                    <td className="px-3 py-2 text-right">
                      {row.meetsTarget ? (
                        <span className="text-teal-400 flex items-center justify-end gap-0.5">
                          <TrendingUp className="w-3 h-3" /> OK
                        </span>
                      ) : (
                        <span className="text-rose-400 flex items-center justify-end gap-0.5">
                          <TrendingDown className="w-3 h-3" /> {(row.achievementRate * 100).toFixed(0)}%
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
