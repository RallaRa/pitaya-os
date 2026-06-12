'use client';

import { useEffect, useState } from 'react';
import { Loader2, RefreshCw, AlertTriangle } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import StockPortfolioPanel from '@/components/stock-trader/StockPortfolioPanel';

interface HealthPayload {
  ok?: boolean;
  configured?: boolean;
  mode?: 'direct' | 'proxy';
  baseUrl?: string;
  error?: string;
  status?: {
    kis?: { configured?: boolean; paper?: boolean; live?: boolean; account?: string };
    alpaca?: { configured?: boolean; paper?: boolean };
    trading?: { mode?: string; ordersAllowed?: boolean; warnings?: string[] };
  };
}

export default function StockTraderOverviewPage() {
  const [data, setData] = useState<HealthPayload | null>(null);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/stock-trader/health', { headers });
      setData(await res.json());
    } catch (e: unknown) {
      setData({ ok: false, error: e instanceof Error ? e.message : String(e) });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void load(); }, []);

  const kis = data?.status?.kis;
  const trading = data?.status?.trading;
  const isLive = kis?.live && kis?.configured;

  return (
    <div className="p-4 sm:p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">KIS AI 자동매매</h1>
          <p className="text-sm text-slate-400 mt-1">슈퍼유저 전용 · stock-trader 서버 연동</p>
        </div>
        <button
          type="button"
          onClick={() => void load()}
          disabled={loading}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-800 text-slate-300 text-sm hover:bg-slate-700"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          새로고침
        </button>
      </div>

      {loading && !data && (
        <div className="flex justify-center py-12 text-slate-400">
          <Loader2 className="w-6 h-6 animate-spin" />
        </div>
      )}

      {data?.error && (
        <div className="rounded-xl border border-red-500/30 bg-red-900/20 px-4 py-3 text-red-300 text-sm">
          {data.error}
        </div>
      )}

      {isLive && (
        <div className="rounded-xl border border-amber-500/40 bg-amber-900/20 px-4 py-3 flex gap-2 text-amber-200 text-sm">
          <AlertTriangle className="w-5 h-5 shrink-0" />
          <span>KIS 실전 계좌 — 실제 자금으로 거래됩니다. 주문 전 설정을 확인하세요.</span>
        </div>
      )}

      {data && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500 mb-2">연동 서버</p>
            <p className="text-sm text-slate-200 font-mono break-all">{data.baseUrl || '—'}</p>
            <p className="text-xs mt-2 text-slate-400">
              {data.configured
                ? (data.mode === 'direct' ? 'KIS 직접 연동 (Vercel)' : 'API Token 설정됨')
                : 'KIS env 미설정'}
            </p>
          </div>
          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
            <p className="text-xs text-slate-500 mb-2">KIS</p>
            <p className="text-sm text-white">
              {kis?.configured
                ? `${kis.paper ? '모의' : '실전'} · ${kis.account || ''}`
                : '미설정'}
            </p>
            <p className="text-xs mt-2 text-slate-400">
              주문 {trading?.ordersAllowed ? '허용' : '차단'} · mode={trading?.mode || '—'}
            </p>
          </div>
        </div>
      )}

      {trading?.warnings?.length ? (
        <ul className="text-sm text-slate-400 space-y-1 list-disc pl-5">
          {trading.warnings.map(w => <li key={w}>{w}</li>)}
        </ul>
      ) : null}

      <StockPortfolioPanel />

      <a
        href="/dashboard/stock-trader/trade"
        className="block rounded-xl border border-teal-500/30 bg-teal-900/20 p-4 text-center text-teal-300 text-sm font-medium hover:bg-teal-900/30"
      >
        MTS 매매 화면 열기 →
      </a>
    </div>
  );
}
