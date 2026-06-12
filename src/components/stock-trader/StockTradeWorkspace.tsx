'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, Search } from 'lucide-react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';
import StockQuoteHeader, { StockFundamentalGrid } from '@/components/stock-trader/StockQuoteHeader';
import StockCandleChart from '@/components/stock-trader/StockCandleChart';
import type { KisCandle, KisQuote } from '@/lib/stock-trader/kisQuote';
import { POPULAR_SYMBOLS } from '@/lib/stock-trader/kisQuote';

export default function StockTradeWorkspace() {
  const searchParams = useSearchParams();
  const { call, loading, error } = useStockTraderApi();
  const initialSymbol = searchParams.get('symbol') || '005930';
  const [symbol, setSymbol] = useState(initialSymbol);
  const [nameHint, setNameHint] = useState('삼성전자');
  const [qty, setQty] = useState('1');
  const [quote, setQuote] = useState<KisQuote | null>(null);
  const [candles, setCandles] = useState<KisCandle[]>([]);
  const [orderResult, setOrderResult] = useState('');

  const loadQuote = useCallback(async (sym: string) => {
    const code = sym.padStart(6, '0');
    const res = await call<{ quote: KisQuote; candles: KisCandle[] }>(`kis/quote/${code}`);
    setQuote(res.quote);
    setCandles(res.candles || []);
    if (res.quote?.name) setNameHint(res.quote.name);
  }, [call]);

  useEffect(() => {
    const sym = searchParams.get('symbol');
    if (sym) {
      setSymbol(sym.replace(/\D/g, '').slice(0, 6));
      void loadQuote(sym).catch(() => {});
    } else {
      void loadQuote(symbol).catch(() => {});
    }
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  const onSearch = () => void loadQuote(symbol).catch(() => {});

  const order = async (side: 'buy' | 'sell') => {
    const n = parseInt(qty, 10);
    if (n < 1) return;
    const res = await call<{ data?: unknown }>('kis/order', {
      method: 'POST',
      body: JSON.stringify({ symbol: symbol.padStart(6, '0'), qty: n, side }),
    });
    setOrderResult(JSON.stringify(res.data ?? res, null, 2));
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5 pb-24">
      <div>
        <h1 className="text-xl font-bold text-white">KIS 수동 매매 · 시세</h1>
        <p className="text-sm text-amber-300/90 mt-1">실전 계좌 연결 시 실제 주문됩니다.</p>
      </div>

      {/* 종목 검색 */}
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {POPULAR_SYMBOLS.map(s => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => { setSymbol(s.symbol); setNameHint(s.name); void loadQuote(s.symbol); }}
              className={`px-2 py-1 rounded-md text-xs border ${
                symbol === s.symbol
                  ? 'border-teal-500 text-teal-300 bg-teal-900/30'
                  : 'border-slate-700 text-slate-400 hover:border-slate-500'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-2 items-end">
          <label className="flex-1 min-w-[140px] text-sm text-slate-400">
            종목코드
            <input
              value={symbol}
              onChange={e => setSymbol(e.target.value.replace(/\D/g, '').slice(0, 6))}
              onKeyDown={e => e.key === 'Enter' && onSearch()}
              className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white font-mono"
            />
          </label>
          <div className="flex-1 min-w-[140px] text-sm">
            <span className="text-slate-500">종목명</span>
            <p className="mt-2 text-white font-semibold truncate">{quote?.name || nameHint || '—'}</p>
          </div>
          <button
            type="button"
            onClick={onSearch}
            disabled={loading}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-teal-700 text-white text-sm h-[42px]"
          >
            {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
            시세 조회
          </button>
        </div>
      </div>

      <StockQuoteHeader quote={quote} loading={loading && !quote} />

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-xl border border-slate-700/60 bg-slate-900/50 p-3">
          <p className="text-sm font-medium text-slate-300 px-1 mb-2">일봉 차트 · 종가/고저 · 거래량</p>
          <StockCandleChart candles={candles} />
        </div>

        <div className="space-y-4">
          {quote && <StockFundamentalGrid quote={quote} />}

          <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 space-y-3">
            <p className="text-sm font-medium text-slate-300">주문</p>
            <label className="block text-sm text-slate-400">
              수량 (주)
              <input
                value={qty}
                onChange={e => setQty(e.target.value.replace(/\D/g, ''))}
                className="mt-1 w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-white"
              />
            </label>
            {quote && (
              <p className="text-xs text-slate-500">
                예상 금액: {(quote.price * (parseInt(qty, 10) || 0)).toLocaleString()}원
              </p>
            )}
            <div className="flex gap-2">
              <button type="button" onClick={() => void order('buy')} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-red-600 hover:bg-red-500 text-white text-sm font-semibold">
                매수
              </button>
              <button type="button" onClick={() => void order('sell')} disabled={loading} className="flex-1 py-2.5 rounded-lg bg-blue-600 hover:bg-blue-500 text-white text-sm font-semibold">
                매도
              </button>
            </div>
          </div>
        </div>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {orderResult && (
        <pre className="text-xs text-slate-300 bg-slate-900/80 border border-slate-700 rounded-xl p-4 overflow-x-auto">{orderResult}</pre>
      )}
    </div>
  );
}
