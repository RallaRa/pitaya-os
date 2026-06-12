'use client';

import { useCallback, useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle, Power } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import StockAiCouncilPanel from '@/components/stock/StockAiCouncilPanel';
import StockTradeFeed from '@/components/stock/StockTradeFeed';
import StockEmergencyFab from '@/components/stock/StockEmergencyFab';
import StockFcmRegister from '@/components/stock/StockFcmRegister';
import StockAiChatPanel from '@/components/stock/StockAiChatPanel';
import StockEngineStatusBar from '@/components/stock/StockEngineStatusBar';
import StockBacktestPanel from '@/components/stock/StockBacktestPanel';
import Link from 'next/link';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts';

interface DashboardData {
  portfolio: {
    totalEval: number;
    cash: number;
    cashRatio: number;
    todayPnl: number;
    totalReturnPct: number;
    sharpe: number;
    mdd: number;
    aiConfidence: number;
    strategyMode: string;
    lastTradeAt: string | null;
    lastTradeResult: string | null;
    nextAction: string;
    aiReason: string;
  };
  holdings: Array<{
    symbol: string;
    name: string;
    qty: number;
    avgPrice: number;
    currentPrice: number;
    pnlPct: number;
    evalAmt: number;
  }>;
  settings: { masterEnabled: boolean };
  kis: { paper: boolean; live: boolean } | null;
  kisError: string | null;
}

export default function StockSuperuserDashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const session = localStorage.getItem('pitaya_stock_session_id');
      if (session) headers['x-stock-session'] = session;
      const res = await fetch('/api/stock/dashboard', { headers });
      const json = await res.json();
      if (res.ok) setData(json);
      setRefreshKey(k => k + 1);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const toggleMaster = async () => {
    if (!data) return;
    setToggling(true);
    try {
      const headers = await getAuthJsonHeaders();
      const session = localStorage.getItem('pitaya_stock_session_id');
      if (session) headers['x-stock-session'] = session;
      await fetch('/api/stock/master', {
        method: 'POST',
        headers,
        body: JSON.stringify({ enabled: !data.settings.masterEnabled }),
      });
      await load();
    } finally {
      setToggling(false);
    }
  };

  const chartData = [
    { d: 'D-4', v: 980000 },
    { d: 'D-3', v: 995000 },
    { d: 'D-2', v: 990000 },
    { d: 'D-1', v: 1005000 },
    { d: '오늘', v: data?.portfolio.totalEval ?? 1000000 },
  ];

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
      </div>
    );
  }

  const p = data?.portfolio;
  const live = data?.kis?.live;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-6 pb-28 md:pb-6">
      <StockEngineStatusBar
        masterEnabled={!!data?.settings.masterEnabled}
        refreshKey={refreshKey}
      />

      {/* 모바일 AI 상태 바 */}
      <div className="md:hidden">
        <StockAiCouncilPanel />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">AI 완전 자동 주식투자</h1>
          <p className="text-sm text-slate-400">슈퍼유저 전용 · 개인 테스트</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Link
            href="/dashboard/stock-trader/market"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
          >
            시세·차트
          </Link>
          <Link
            href="/dashboard/stock-trader/trade"
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
          >
            수동 매매
          </Link>
          <StockFcmRegister />
          <button
            type="button"
            onClick={async () => {
              const headers = await getAuthJsonHeaders();
              const session = localStorage.getItem('pitaya_stock_session_id');
              if (session) headers['x-stock-session'] = session;
              await fetch('/api/stock/scan', { method: 'POST', headers });
              await load();
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-teal-800 text-teal-100 text-sm"
          >
            시장 스캔
          </button>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm"
          >
            <RefreshCw className="w-4 h-4" /> 새로고침
          </button>
          <button
            type="button"
            disabled={toggling}
            onClick={() => void toggleMaster()}
            className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
              data?.settings.masterEnabled
                ? 'bg-red-900/40 text-red-300 border border-red-500/40'
                : 'bg-teal-700 text-white'
            }`}
          >
            <Power className="w-4 h-4" />
            {data?.settings.masterEnabled ? 'AI OFF (긴급)' : 'AI ON'}
          </button>
        </div>
      </div>

      {live && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 flex gap-2 text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          KIS 실전 — 실제 자금. 마스터 스위치 ON 시 AI가 자동 주문할 수 있습니다.
        </div>
      )}

      {data?.kisError && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-red-300 text-sm">
          KIS 연동: {data.kisError}
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 md:grid md:grid-cols-4">
        {/* 모바일: 스와이프 카드 */}
        <div className="col-span-2 sm:col-span-4 md:contents flex gap-3 overflow-x-auto snap-x snap-mandatory pb-1 md:overflow-visible md:pb-0 md:grid md:grid-cols-4 md:gap-3">
        {[
          ['총 평가', `${(p?.totalEval ?? 0).toLocaleString()}원`],
          ['수익률', `${(p?.totalReturnPct ?? 0).toFixed(2)}%`],
          ['오늘 손익', `${(p?.todayPnl ?? 0).toLocaleString()}원`],
          ['샤프', (p?.sharpe ?? 0).toFixed(2)],
          ['MDD', `${(p?.mdd ?? 0).toFixed(1)}%`],
          ['현금 비중', `${(p?.cashRatio ?? 0).toFixed(1)}%`],
          ['AI 신뢰도', `${((p?.aiConfidence ?? 0) * 100).toFixed(0)}%`],
          ['전략', p?.strategyMode ?? '—'],
        ].map(([label, val]) => (
          <div key={label} className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-3 min-w-[140px] snap-start shrink-0 md:min-w-0 md:shrink">
            <p className="text-[10px] text-slate-500 uppercase">{label}</p>
            <p className="text-sm font-semibold text-white mt-1">{val}</p>
          </div>
        ))}
        </div>
      </div>

      <div className="hidden md:block">
        <StockAiCouncilPanel />
      </div>

      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
        <StockBacktestPanel compact maxRows={5} showTitle />
      </div>

      <div className="md:hidden">
        <StockTradeFeed />
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <p className="text-sm font-medium text-slate-300 mb-3">AI 상태</p>
          <dl className="text-sm space-y-2 text-slate-400">
            <div><dt className="inline text-slate-500">근거: </dt>{p?.aiReason}</div>
            <div><dt className="inline text-slate-500">다음: </dt>{p?.nextAction}</div>
            <div><dt className="inline text-slate-500">마지막 매매: </dt>{p?.lastTradeAt || '없음'} {p?.lastTradeResult || ''}</div>
          </dl>
        </div>
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 h-48">
          <p className="text-sm font-medium text-slate-300 mb-2">평가금 추이</p>
          <ResponsiveContainer width="100%" height="85%">
            <LineChart data={chartData}>
              <CartesianGrid stroke="#334155" strokeDasharray="3 3" />
              <XAxis dataKey="d" tick={{ fill: '#94a3b8', fontSize: 10 }} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 10 }} width={60} />
              <Tooltip contentStyle={{ background: '#0f172a', border: '1px solid #334155' }} />
              <Line type="monotone" dataKey="v" stroke="#2dd4bf" dot={false} strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700/60 overflow-hidden">
        <p className="px-4 py-3 text-sm font-medium text-slate-300 bg-slate-900/80">보유 종목</p>
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-left">
            <thead className="text-slate-500 border-b border-slate-800">
              <tr>
                <th className="px-4 py-2">종목</th>
                <th className="px-4 py-2">매입가</th>
                <th className="px-4 py-2">현재가</th>
                <th className="px-4 py-2">수익률</th>
                <th className="px-4 py-2">비중</th>
              </tr>
            </thead>
            <tbody>
              {(data?.holdings || []).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-6 text-slate-500 text-center">보유 종목 없음</td></tr>
              ) : (
                data!.holdings.map(h => (
                  <tr key={h.symbol} className="border-b border-slate-800/60 text-slate-300">
                    <td className="px-4 py-2">{h.name || h.symbol}</td>
                    <td className="px-4 py-2">{h.avgPrice.toLocaleString()}</td>
                    <td className="px-4 py-2">{h.currentPrice.toLocaleString()}</td>
                    <td className={`px-4 py-2 ${h.pnlPct >= 0 ? 'text-teal-400' : 'text-red-400'}`}>
                      {h.pnlPct.toFixed(2)}%
                    </td>
                    <td className="px-4 py-2">
                      {p?.totalEval ? ((h.evalAmt / p.totalEval) * 100).toFixed(1) : 0}%
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="hidden md:block">
        <StockTradeFeed />
      </div>

      <StockEmergencyFab
        enabled={!!data?.settings.masterEnabled}
        onToggle={() => void load()}
      />

      <StockAiChatPanel />
    </div>
  );
}
