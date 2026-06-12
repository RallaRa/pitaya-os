'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import StockCandleChart from '@/components/stock-trader/StockCandleChart';
import type { KisCandle, KisQuote } from '@/lib/stock-trader/kisQuote';
import { POPULAR_SYMBOLS } from '@/lib/stock-trader/kisQuote';

interface WatchItem {
  symbol: string;
  name: string;
  quote: KisQuote | null;
  candles: KisCandle[];
}

export default function StockMarketBoard() {
  const [items, setItems] = useState<WatchItem[]>([]);
  const [selected, setSelected] = useState('005930');
  const [loading, setLoading] = useState(true);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthJsonHeaders();
      const results = await Promise.all(
        POPULAR_SYMBOLS.map(async s => {
          try {
            const res = await fetch(`/api/stock-trader/kis/quote/${s.symbol}`, { headers });
            const data = await res.json();
            if (!res.ok) throw new Error(data.error);
            return {
              symbol: s.symbol,
              name: data.quote?.name || s.name,
              quote: data.quote as KisQuote,
              candles: (data.candles || []) as KisCandle[],
            };
          } catch {
            return { symbol: s.symbol, name: s.name, quote: null, candles: [] };
          }
        }),
      );
      setItems(results);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const active = items.find(i => i.symbol === selected) || items[0];

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-bold text-white">시세 · 관심종목</h1>
        <p className="text-sm text-slate-400 mt-1">KIS API 실시간 시세 · 일봉 차트</p>
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {items.map(item => {
          const q = item.quote;
          const up = (q?.change ?? 0) >= 0;
          return (
            <button
              key={item.symbol}
              type="button"
              onClick={() => setSelected(item.symbol)}
              className={`text-left rounded-xl border p-3 transition-colors ${
                selected === item.symbol
                  ? 'border-teal-500/50 bg-teal-900/20'
                  : 'border-slate-700/60 bg-slate-900/50 hover:border-slate-600'
              }`}
            >
              <p className="text-sm font-semibold text-white truncate">{item.name}</p>
              <p className="text-[10px] text-slate-500 font-mono">{item.symbol}</p>
              {q ? (
                <>
                  <p className="text-lg font-bold text-white mt-1">{q.price.toLocaleString()}</p>
                  <p className={`text-xs ${up ? 'text-red-400' : 'text-blue-400'}`}>
                    {up ? '▲' : '▼'} {Math.abs(q.changePct).toFixed(2)}%
                  </p>
                </>
              ) : (
                <p className="text-xs text-slate-500 mt-2">—</p>
              )}
            </button>
          );
        })}
      </div>

      {loading && items.length === 0 && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-slate-500" />
        </div>
      )}

      {active?.quote && (
        <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <div>
              <p className="text-lg font-bold text-white">
                {active.quote.name}
                <span className="ml-2 text-sm font-normal text-slate-400">{active.symbol}</span>
              </p>
              <p className="text-2xl font-bold text-white">{active.quote.price.toLocaleString()}원</p>
            </div>
            <Link
              href={`/dashboard/stock-trader/trade?symbol=${active.symbol}`}
              className="px-3 py-2 rounded-lg bg-teal-700 text-white text-sm"
            >
              매매하기
            </Link>
          </div>
          <StockCandleChart candles={active.candles} height={320} />
        </div>
      )}
    </div>
  );
}
