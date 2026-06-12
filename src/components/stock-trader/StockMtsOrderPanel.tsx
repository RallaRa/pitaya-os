'use client';

import { useState } from 'react';
import type { KisQuote } from '@/lib/stock-trader/kisQuote';

interface Props {
  quote: KisQuote | null;
  qty: string;
  price: string;
  orderType: 'market' | 'limit';
  loading?: boolean;
  onQtyChange: (v: string) => void;
  onPriceChange: (v: string) => void;
  onOrderTypeChange: (v: 'market' | 'limit') => void;
  onOrder: (side: 'buy' | 'sell') => void;
}

export default function StockMtsOrderPanel({
  quote, qty, price, orderType, loading, onQtyChange, onPriceChange, onOrderTypeChange, onOrder,
}: Props) {
  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const n = parseInt(qty, 10) || 0;
  const p = orderType === 'limit' ? (parseInt(price.replace(/\D/g, ''), 10) || 0) : (quote?.price || 0);
  const est = n * p;

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/80 p-3 space-y-3">
      <div className="flex rounded-lg overflow-hidden border border-slate-700">
        <button type="button" onClick={() => setSide('buy')} className={`flex-1 py-2 text-sm font-bold ${side === 'buy' ? 'bg-red-600 text-white' : 'bg-slate-900 text-slate-400'}`}>매수</button>
        <button type="button" onClick={() => setSide('sell')} className={`flex-1 py-2 text-sm font-bold ${side === 'sell' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400'}`}>매도</button>
      </div>

      <div className="flex gap-1">
        {(['market', 'limit'] as const).map(t => (
          <button
            key={t}
            type="button"
            onClick={() => onOrderTypeChange(t)}
            className={`flex-1 py-1 rounded text-[10px] border ${orderType === t ? 'border-teal-500 text-teal-300 bg-teal-900/30' : 'border-slate-700 text-slate-500'}`}
          >
            {t === 'market' ? '시장가' : '지정가'}
          </button>
        ))}
      </div>

      <label className="block text-[10px] text-slate-500">
        수량 (주)
        <input value={qty} onChange={e => onQtyChange(e.target.value.replace(/\D/g, ''))} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white font-mono text-sm" />
      </label>

      {orderType === 'limit' && (
        <label className="block text-[10px] text-slate-500">
          가격 (원)
          <input value={price} onChange={e => onPriceChange(e.target.value.replace(/\D/g, ''))} className="mt-1 w-full rounded bg-slate-900 border border-slate-700 px-2 py-1.5 text-white font-mono text-sm" />
        </label>
      )}

      <p className="text-[10px] text-slate-500">예상금액 <span className="text-white font-semibold">{est.toLocaleString()}원</span></p>

      <button
        type="button"
        disabled={loading || n < 1}
        onClick={() => onOrder(side)}
        className={`w-full py-2.5 rounded-lg text-sm font-bold text-white ${side === 'buy' ? 'bg-red-600 hover:bg-red-500' : 'bg-blue-600 hover:bg-blue-500'} disabled:opacity-40`}
      >
        {side === 'buy' ? '매수 주문' : '매도 주문'}
      </button>
    </div>
  );
}
