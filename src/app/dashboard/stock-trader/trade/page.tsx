'use client';

import { useState } from 'react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';

export default function StockTraderTradePage() {
  const { call, loading, error } = useStockTraderApi();
  const [symbol, setSymbol] = useState('005930');
  const [qty, setQty] = useState('1');
  const [result, setResult] = useState('');

  const order = async (side: 'buy' | 'sell') => {
    const n = parseInt(qty, 10);
    if (n < 1) return;
    const res = await call<{ data?: unknown }>('kis/order', {
      method: 'POST',
      body: JSON.stringify({ symbol: symbol.padStart(6, '0'), qty: n, side }),
    });
    setResult(JSON.stringify(res.data ?? res, null, 2));
  };

  const quote = async () => {
    const res = await call<{ data?: unknown }>(`kis/price/${symbol.padStart(6, '0')}`);
    setResult(JSON.stringify(res.data ?? res, null, 2));
  };

  return (
    <div className="p-4 sm:p-6 max-w-xl mx-auto space-y-5">
      <h1 className="text-lg font-bold text-white">KIS 수동 매매</h1>
      <p className="text-sm text-amber-300/90">실전 계좌 연결 시 실제 주문됩니다.</p>

      <label className="block text-sm text-slate-400">
        종목코드
        <input
          value={symbol}
          onChange={e => setSymbol(e.target.value.replace(/\D/g, '').slice(0, 6))}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>
      <label className="block text-sm text-slate-400">
        수량
        <input
          value={qty}
          onChange={e => setQty(e.target.value.replace(/\D/g, ''))}
          className="mt-1 w-full rounded-lg bg-slate-900 border border-slate-700 px-3 py-2 text-white"
        />
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void quote()} disabled={loading} className="px-4 py-2 rounded-lg bg-slate-700 text-white text-sm">시세</button>
        <button type="button" onClick={() => void order('buy')} disabled={loading} className="px-4 py-2 rounded-lg bg-teal-700 text-white text-sm">매수</button>
        <button type="button" onClick={() => void order('sell')} disabled={loading} className="px-4 py-2 rounded-lg bg-red-800 text-white text-sm">매도</button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && <pre className="text-xs text-slate-300 bg-slate-900/80 border border-slate-700 rounded-xl p-4 overflow-x-auto">{result}</pre>}
    </div>
  );
}
