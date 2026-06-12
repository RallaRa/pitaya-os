'use client';

import type { KisQuote } from '@/lib/stock-trader/kisQuote';

interface Props {
  quote: KisQuote | null;
  loading?: boolean;
}

function fmt(n: number) {
  return n.toLocaleString('ko-KR');
}

export default function StockQuoteHeader({ quote, loading }: Props) {
  if (loading) {
    return <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-6 animate-pulse h-28" />;
  }

  if (!quote || !quote.name) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-6 text-slate-500 text-sm">
        종목코드를 입력하고 시세 조회를 눌러주세요.
      </div>
    );
  }

  const up = quote.change >= 0;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-lg sm:text-xl font-bold text-white">
            {quote.name}
            <span className="ml-2 text-sm font-normal text-slate-400">{quote.symbol}</span>
          </p>
          <p className="text-2xl sm:text-3xl font-bold text-white mt-1">
            {fmt(quote.price)}
            <span className="text-base font-medium ml-2">원</span>
          </p>
          <p className={`text-sm mt-1 ${up ? 'text-red-400' : 'text-blue-400'}`}>
            {up ? '▲' : '▼'} {fmt(Math.abs(quote.change))} ({quote.changePct.toFixed(2)}%)
          </p>
        </div>
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-slate-400">
          <span>시가 <b className="text-slate-200">{fmt(quote.open)}</b></span>
          <span>고가 <b className="text-red-300">{fmt(quote.high)}</b></span>
          <span>저가 <b className="text-blue-300">{fmt(quote.low)}</b></span>
          <span>전일 <b className="text-slate-200">{fmt(quote.prevClose)}</b></span>
          <span>거래량 <b className="text-slate-200">{fmt(quote.volume)}</b></span>
          <span>거래대금 <b className="text-slate-200">{Math.round(quote.amount / 100000000)}억</b></span>
        </div>
      </div>
    </div>
  );
}

export function StockFundamentalGrid({ quote }: { quote: KisQuote }) {
  const items = [
    ['PER', quote.per ? quote.per.toFixed(2) : '—'],
    ['PBR', quote.pbr ? quote.pbr.toFixed(2) : '—'],
    ['EPS', quote.eps ? fmt(quote.eps) : '—'],
    ['BPS', quote.bps ? fmt(quote.bps) : '—'],
    ['52주 최고', quote.high52 ? fmt(quote.high52) : '—'],
    ['52주 최저', quote.low52 ? fmt(quote.low52) : '—'],
    ['상한가', quote.upperLimit ? fmt(quote.upperLimit) : '—'],
    ['하한가', quote.lowerLimit ? fmt(quote.lowerLimit) : '—'],
  ];

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-4">
      <p className="text-sm font-medium text-slate-300 mb-3">재무·가격 지표</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {items.map(([label, val]) => (
          <div key={label} className="rounded-lg bg-slate-950/50 px-3 py-2">
            <p className="text-[10px] text-slate-500">{label}</p>
            <p className="text-sm font-semibold text-white">{val}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
