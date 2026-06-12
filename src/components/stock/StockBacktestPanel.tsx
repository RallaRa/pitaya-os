'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface ScoreRow {
  symbol: string;
  name?: string;
  composite: number;
  buyProbability: number;
  rank?: number;
}

interface BacktestData {
  avgComposite: number;
  top5VirtualReturnPct: number;
  top20: ScoreRow[];
  date: string | null;
  strategyMode: string | null;
  count: number;
}

interface Props {
  compact?: boolean;
  showTitle?: boolean;
  maxRows?: number;
}

export default function StockBacktestPanel({
  compact = false,
  showTitle = true,
  maxRows = 20,
}: Props) {
  const [data, setData] = useState<BacktestData | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const session = localStorage.getItem('pitaya_stock_session_id');
      if (session) headers['x-stock-session'] = session;
      const res = await fetch('/api/stock/backtest', { headers, cache: 'no-store' });
      const json = await res.json();
      if (res.ok) {
        setData({
          avgComposite: json.avgComposite ?? 0,
          top5VirtualReturnPct: json.top5VirtualReturnPct ?? 0,
          top20: json.top20 ?? [],
          date: json.date ?? null,
          strategyMode: json.strategyMode ?? null,
          count: json.count ?? 0,
        });
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const rows = (data?.top20 || []).slice(0, maxRows);
  const ret = data?.top5VirtualReturnPct ?? 0;

  return (
    <div className={`space-y-4 ${compact ? '' : 'pb-2'}`}>
      {showTitle && (
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className={`font-bold text-white ${compact ? 'text-sm' : 'text-lg'}`}>
              백테스트 · 스코어 시뮬
            </h2>
            <p className="text-sm text-slate-400 mt-0.5">
              최근 팩터 스코어 Top20 기준 간이 시뮬 (FDR 10년 백테스트는 추후 연동)
            </p>
            {data?.date && (
              <p className="text-[10px] text-slate-600 mt-1">
                기준일 {data.date}
                {data.strategyMode ? ` · ${data.strategyMode}` : ''}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => void load()}
              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-slate-800 text-slate-400 text-xs hover:text-white"
            >
              <RefreshCw className="w-3 h-3" /> 새로고침
            </button>
            {compact && (
              <Link
                href="/dashboard/superuser/stock/backtest"
                className="text-xs text-teal-400 hover:text-teal-300"
              >
                전체 보기 →
              </Link>
            )}
          </div>
        </div>
      )}

      {loading && !data ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-6 text-center">
          <p className="text-sm text-slate-500">스코어 없음</p>
          <p className="text-xs text-slate-600 mt-1">AI 시장 스캔 또는 장마감 후 POS 스코어 저장을 실행하세요</p>
          <Link
            href="/dashboard/superuser/stock/ai-engine"
            className="inline-block mt-3 text-xs text-teal-400 hover:underline"
          >
            AI 시장 스캔 실행 →
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-500">평균 복합 스코어</p>
              <p className={`font-bold text-white ${compact ? 'text-lg' : 'text-xl'}`}>
                {(data?.avgComposite ?? 0).toFixed(1)}
              </p>
            </div>
            <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
              <p className="text-xs text-slate-500">Top5 가상 수익률*</p>
              <p className={`font-bold ${compact ? 'text-lg' : 'text-xl'} ${ret >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                {ret >= 0 ? '+' : ''}{ret.toFixed(2)}%
              </p>
            </div>
          </div>

          <p className="text-[10px] text-slate-600">
            * buyProbability 기반 간이 추정, 실제 체결과 다를 수 있음
          </p>

          <div className="rounded-xl border border-slate-700/60 overflow-hidden bg-slate-900/30">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-slate-500 border-b border-slate-800">
                  <th className="text-left p-2 pl-3 w-10">#</th>
                  <th className="text-left p-2">종목</th>
                  <th className="text-right p-2">스코어</th>
                  <th className="text-right p-2 pr-3">매수확률</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.symbol} className="border-b border-slate-800/50 text-slate-300 last:border-0">
                    <td className="p-2 pl-3 text-slate-500">{r.rank ?? i + 1}</td>
                    <td className="p-2">
                      <span className="font-mono text-slate-200">{r.symbol}</span>
                      {!compact && r.name && r.name !== r.symbol && (
                        <span className="block text-[10px] text-slate-500 truncate max-w-[120px]">{r.name}</span>
                      )}
                    </td>
                    <td className="text-right p-2 tabular-nums">{r.composite.toFixed(1)}</td>
                    <td className="text-right p-2 pr-3 tabular-nums">
                      {(r.buyProbability * 100).toFixed(0)}%
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
