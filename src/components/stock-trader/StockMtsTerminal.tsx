'use client';

import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2, RefreshCw, Search } from 'lucide-react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';
import StockCandleChart from '@/components/stock-trader/StockCandleChart';
import StockOrderBook from '@/components/stock-trader/StockOrderBook';
import StockMtsOrderPanel from '@/components/stock-trader/StockMtsOrderPanel';
import StockMtsBottomPanel from '@/components/stock-trader/StockMtsBottomPanel';
import type {
  ChartPeriod,
  KisCandle,
  KisFill,
  KisHolding,
  KisOrderbookLevel,
  KisPendingOrder,
  KisQuote,
} from '@/lib/stock-trader/kisQuote';
import { POPULAR_SYMBOLS } from '@/lib/stock-trader/kisQuote';

const CHART_TABS: { id: ChartPeriod; label: string }[] = [
  { id: '1', label: '1분' },
  { id: '5', label: '5분' },
  { id: '15', label: '15분' },
  { id: 'D', label: '일' },
  { id: 'W', label: '주' },
];

export default function StockMtsTerminal() {
  const searchParams = useSearchParams();
  const { call, loading, error } = useStockTraderApi();
  const [symbol, setSymbol] = useState(searchParams.get('symbol') || '005930');
  const [quote, setQuote] = useState<KisQuote | null>(null);
  const [candles, setCandles] = useState<KisCandle[]>([]);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>('D');
  const [bookLevels, setBookLevels] = useState<KisOrderbookLevel[]>([]);
  const [holdings, setHoldings] = useState<KisHolding[]>([]);
  const [pending, setPending] = useState<KisPendingOrder[]>([]);
  const [fills, setFills] = useState<KisFill[]>([]);
  const [bottomTab, setBottomTab] = useState<'holdings' | 'pending' | 'fills'>('holdings');
  const [qty, setQty] = useState('1');
  const [price, setPrice] = useState('');
  const [orderType, setOrderType] = useState<'market' | 'limit'>('market');
  const [toast, setToast] = useState('');
  const [refreshing, setRefreshing] = useState(false);

  const loadQuote = useCallback(async (sym: string) => {
    const code = sym.padStart(6, '0');
    const res = await call<{ quote: KisQuote }>(`kis/price/${code}`);
    setQuote(res.quote);
    if (res.quote?.price && !price) setPrice(String(res.quote.price));
  }, [call, price]);

  const loadChart = useCallback(async (sym: string, period: ChartPeriod) => {
    const code = sym.padStart(6, '0');
    const res = await call<{ candles: KisCandle[] }>(`kis/chart/${code}?period=${period}`);
    setCandles(res.candles || []);
  }, [call]);

  const loadOrderbook = useCallback(async (sym: string) => {
    const code = sym.padStart(6, '0');
    const res = await call<{ book: { levels: KisOrderbookLevel[] } }>(`kis/orderbook/${code}`);
    setBookLevels(res.book?.levels || []);
  }, [call]);

  const loadPortfolio = useCallback(async () => {
    const res = await call<{ portfolio: { holdings: KisHolding[] } }>('kis/portfolio');
    setHoldings(res.portfolio?.holdings || []);
  }, [call]);

  const loadPending = useCallback(async () => {
    const res = await call<{ pending: KisPendingOrder[] }>('kis/pending');
    setPending(res.pending || []);
  }, [call]);

  const loadFills = useCallback(async () => {
    const res = await call<{ fills: KisFill[] }>('kis/fills');
    setFills(res.fills || []);
  }, [call]);

  const refreshAll = useCallback(async (sym: string) => {
    setRefreshing(true);
    try {
      await Promise.all([
        loadQuote(sym),
        loadChart(sym, chartPeriod),
        loadOrderbook(sym),
        loadPortfolio(),
        loadPending(),
        loadFills(),
      ]);
    } finally {
      setRefreshing(false);
    }
  }, [chartPeriod, loadChart, loadFills, loadOrderbook, loadPending, loadPortfolio, loadQuote]);

  useEffect(() => {
    const sym = searchParams.get('symbol') || symbol;
    setSymbol(sym.replace(/\D/g, '').slice(0, 6));
    void refreshAll(sym).catch(() => {});
  }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    void loadChart(symbol, chartPeriod).catch(() => {});
  }, [chartPeriod, symbol, loadChart]);

  useEffect(() => {
    const t = setInterval(() => {
      void loadQuote(symbol).catch(() => {});
      void loadOrderbook(symbol).catch(() => {});
    }, 5000);
    return () => clearInterval(t);
  }, [symbol, loadQuote, loadOrderbook]);

  const submitOrder = async (side: 'buy' | 'sell') => {
    const n = parseInt(qty, 10);
    if (n < 1) return;
    const body: Record<string, unknown> = {
      symbol: symbol.padStart(6, '0'),
      qty: n,
      side,
      orderType,
    };
    if (orderType === 'limit') {
      body.price = parseInt(price.replace(/\D/g, ''), 10) || quote?.price;
    }
    await call('kis/order', { method: 'POST', body: JSON.stringify(body) });
    setToast(`${side === 'buy' ? '매수' : '매도'} 주문 접수`);
    await refreshAll(symbol);
  };

  const cancelOrder = async (o: KisPendingOrder) => {
    await call('kis/cancel', {
      method: 'POST',
      body: JSON.stringify({
        symbol: o.symbol,
        qty: o.qty,
        orderNo: o.orderNo,
        orgOrderNo: o.orgOrderNo,
      }),
    });
    setToast('주문 취소 요청');
    await loadPending();
  };

  const up = (quote?.change ?? 0) >= 0;

  return (
    <div className="flex flex-col h-[calc(100dvh-7rem)] min-h-[600px] bg-slate-950 text-white">
      {/* 상단 시세 바 */}
      <div className="shrink-0 border-b border-slate-800 px-3 py-2 flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap gap-1">
          {POPULAR_SYMBOLS.map(s => (
            <button
              key={s.symbol}
              type="button"
              onClick={() => { setSymbol(s.symbol); void refreshAll(s.symbol); }}
              className={`px-2 py-0.5 rounded text-[10px] border ${symbol === s.symbol ? 'border-teal-500 text-teal-300' : 'border-slate-700 text-slate-500'}`}
            >
              {s.name}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-1 min-w-[200px]">
          <input
            value={symbol}
            onChange={e => setSymbol(e.target.value.replace(/\D/g, '').slice(0, 6))}
            onKeyDown={e => e.key === 'Enter' && void refreshAll(symbol)}
            className="w-20 rounded bg-slate-900 border border-slate-700 px-2 py-1 font-mono text-sm"
          />
          <button type="button" onClick={() => void refreshAll(symbol)} className="p-1.5 rounded bg-slate-800 text-slate-300">
            {refreshing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
          </button>
          {quote && (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="font-bold text-sm">{quote.name}</span>
              <span className="text-lg font-bold">{quote.price.toLocaleString()}</span>
              <span className={`text-xs ${up ? 'text-red-400' : 'text-blue-400'}`}>
                {up ? '▲' : '▼'}{Math.abs(quote.changePct).toFixed(2)}%
              </span>
            </div>
          )}
        </div>
        <button type="button" onClick={() => void refreshAll(symbol)} className="text-slate-400 hover:text-white">
          <RefreshCw className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* MTS 3단 */}
      <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_260px] xl:grid-cols-[1fr_240px_260px] gap-2 p-2 overflow-hidden">
        <div className="flex flex-col min-h-0 gap-2">
          <div className="flex gap-1">
            {CHART_TABS.map(t => (
              <button
                key={t.id}
                type="button"
                onClick={() => setChartPeriod(t.id)}
                className={`px-2 py-1 rounded text-[10px] ${chartPeriod === t.id ? 'bg-teal-800 text-white' : 'bg-slate-800 text-slate-400'}`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-[200px] rounded-lg border border-slate-700/60 bg-slate-900/30 p-1">
            <StockCandleChart candles={candles} height={240} />
          </div>
          <StockMtsBottomPanel
            tab={bottomTab}
            onTabChange={setBottomTab}
            holdings={holdings}
            pending={pending}
            fills={fills}
            onSelectSymbol={s => { setSymbol(s); void refreshAll(s); }}
            onCancel={o => void cancelOrder(o)}
            loading={loading && holdings.length === 0}
          />
        </div>

        <div className="hidden xl:block min-h-0 overflow-y-auto">
          <p className="text-[10px] text-slate-500 mb-1 px-1">호가창</p>
          <StockOrderBook levels={bookLevels} onPriceClick={p => { setPrice(String(p)); setOrderType('limit'); }} />
        </div>

        <div className="min-h-0 overflow-y-auto space-y-2">
          <div className="xl:hidden">
            <StockOrderBook levels={bookLevels} onPriceClick={p => { setPrice(String(p)); setOrderType('limit'); }} />
          </div>
          <StockMtsOrderPanel
            quote={quote}
            qty={qty}
            price={price}
            orderType={orderType}
            loading={loading}
            onQtyChange={setQty}
            onPriceChange={setPrice}
            onOrderTypeChange={setOrderType}
            onOrder={s => void submitOrder(s).catch(e => setToast(e instanceof Error ? e.message : '주문 실패'))}
          />
          {quote && (
            <div className="grid grid-cols-2 gap-1 text-[10px] text-slate-500 px-1">
              <span>PER {quote.per || '—'}</span>
              <span>PBR {quote.pbr || '—'}</span>
              <span>거래량 {quote.volume.toLocaleString()}</span>
              <span>52주고 {quote.high52?.toLocaleString() || '—'}</span>
            </div>
          )}
        </div>
      </div>

      {(error || toast) && (
        <div className={`shrink-0 px-3 py-2 text-xs ${error ? 'text-red-400 bg-red-900/20' : 'text-teal-300 bg-teal-900/20'}`}>
          {error || toast}
        </div>
      )}
    </div>
  );
}
