'use client';

import type { KisOrderbookLevel } from '@/lib/stock-trader/kisQuote';

interface Props {
  levels: KisOrderbookLevel[];
  totalBidQty?: number;
  totalAskQty?: number;
  onPriceClick?: (price: number) => void;
}

export default function StockOrderBook({ levels, totalBidQty, totalAskQty, onPriceClick }: Props) {
  const rows = levels.length > 0 ? levels : Array.from({ length: 5 }, () => ({ bidPrice: 0, bidQty: 0, askPrice: 0, askQty: 0 }));

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/80 overflow-hidden text-xs">
      <div className="px-2 py-1.5 border-b border-slate-800 flex justify-between text-[10px] text-slate-500">
        <span>호가</span>
        <span>잔량합 {totalBidQty?.toLocaleString() || '—'} / {totalAskQty?.toLocaleString() || '—'}</span>
      </div>
      <div className="grid grid-cols-2 gap-px bg-slate-800">
        <div className="bg-slate-950 px-2 py-1 text-[10px] text-blue-400 text-center">매수</div>
        <div className="bg-slate-950 px-2 py-1 text-[10px] text-red-400 text-center">매도</div>
      </div>
      <div className="max-h-[280px] overflow-y-auto">
        {rows.slice(0, 10).map((row, i) => (
          <div key={i} className="grid grid-cols-2 border-b border-slate-800/50">
            <button
              type="button"
              onClick={() => row.bidPrice > 0 && onPriceClick?.(row.bidPrice)}
              className="flex justify-between px-2 py-1 hover:bg-blue-950/40 text-left"
            >
              <span className="text-blue-300 font-mono">{row.bidPrice > 0 ? row.bidPrice.toLocaleString() : '—'}</span>
              <span className="text-slate-500">{row.bidQty > 0 ? row.bidQty.toLocaleString() : ''}</span>
            </button>
            <button
              type="button"
              onClick={() => row.askPrice > 0 && onPriceClick?.(row.askPrice)}
              className="flex justify-between px-2 py-1 hover:bg-red-950/40 text-left"
            >
              <span className="text-red-300 font-mono">{row.askPrice > 0 ? row.askPrice.toLocaleString() : '—'}</span>
              <span className="text-slate-500">{row.askQty > 0 ? row.askQty.toLocaleString() : ''}</span>
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
