'use client';

import type { KisFill, KisHolding, KisPendingOrder } from '@/lib/stock-trader/kisQuote';

type Tab = 'holdings' | 'pending' | 'fills';

interface Props {
  tab: Tab;
  onTabChange: (t: Tab) => void;
  holdings: KisHolding[];
  pending: KisPendingOrder[];
  fills: KisFill[];
  onSelectSymbol: (symbol: string) => void;
  onCancel?: (order: KisPendingOrder) => void;
  loading?: boolean;
}

export default function StockMtsBottomPanel({
  tab, onTabChange, holdings, pending, fills, onSelectSymbol, onCancel, loading,
}: Props) {
  const tabs: { id: Tab; label: string; count?: number }[] = [
    { id: 'holdings', label: '보유', count: holdings.length },
    { id: 'pending', label: '미체결', count: pending.length },
    { id: 'fills', label: '체결', count: fills.length },
  ];

  return (
    <div className="rounded-lg border border-slate-700/60 bg-slate-950/80 overflow-hidden">
      <div className="flex border-b border-slate-800">
        {tabs.map(t => (
          <button
            key={t.id}
            type="button"
            onClick={() => onTabChange(t.id)}
            className={`px-4 py-2 text-xs font-medium ${tab === t.id ? 'text-teal-300 border-b-2 border-teal-500 bg-slate-900/50' : 'text-slate-500 hover:text-slate-300'}`}
          >
            {t.label}{t.count !== undefined ? ` (${t.count})` : ''}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto max-h-[200px] overflow-y-auto">
        {loading && <p className="p-4 text-slate-500 text-xs text-center">조회 중…</p>}

        {tab === 'holdings' && !loading && (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b border-slate-800"><th className="text-left p-2">종목</th><th className="text-right p-2">수량</th><th className="text-right p-2">평단</th><th className="text-right p-2">현재</th><th className="text-right p-2">손익%</th></tr></thead>
            <tbody>
              {holdings.map(h => (
                <tr key={h.symbol} className="border-b border-slate-800/50 hover:bg-slate-800/30 cursor-pointer" onClick={() => onSelectSymbol(h.symbol)}>
                  <td className="p-2"><span className="text-white">{h.name}</span><br /><span className="text-slate-500 font-mono">{h.symbol}</span></td>
                  <td className="text-right p-2 text-slate-300">{h.qty.toLocaleString()}</td>
                  <td className="text-right p-2 text-slate-400">{h.avgPrice.toLocaleString()}</td>
                  <td className="text-right p-2 text-white">{h.currentPrice.toLocaleString()}</td>
                  <td className={`text-right p-2 ${h.pnlPct >= 0 ? 'text-red-400' : 'text-blue-400'}`}>{h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%</td>
                </tr>
              ))}
              {holdings.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">보유 없음</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'pending' && !loading && (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b border-slate-800"><th className="text-left p-2">종목</th><th className="text-right p-2">구분</th><th className="text-right p-2">수량</th><th className="text-right p-2">가격</th><th className="text-right p-2">취소</th></tr></thead>
            <tbody>
              {pending.map(o => (
                <tr key={o.orderNo} className="border-b border-slate-800/50">
                  <td className="p-2 text-white">{o.name || o.symbol}</td>
                  <td className={`text-right p-2 ${o.side === 'buy' ? 'text-red-400' : 'text-blue-400'}`}>{o.side === 'buy' ? '매수' : '매도'}</td>
                  <td className="text-right p-2">{o.qty.toLocaleString()}</td>
                  <td className="text-right p-2">{o.price.toLocaleString()}</td>
                  <td className="text-right p-2">
                    <button type="button" onClick={() => onCancel?.(o)} className="px-2 py-0.5 rounded bg-slate-700 text-slate-300 hover:bg-slate-600">취소</button>
                  </td>
                </tr>
              ))}
              {pending.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">미체결 없음</td></tr>}
            </tbody>
          </table>
        )}

        {tab === 'fills' && !loading && (
          <table className="w-full text-xs">
            <thead><tr className="text-slate-500 border-b border-slate-800"><th className="text-left p-2">종목</th><th className="text-right p-2">구분</th><th className="text-right p-2">체결</th><th className="text-right p-2">가격</th><th className="text-right p-2">시간</th></tr></thead>
            <tbody>
              {fills.map((f, i) => (
                <tr key={`${f.orderNo}-${i}`} className="border-b border-slate-800/50">
                  <td className="p-2 text-white">{f.name || f.symbol}</td>
                  <td className={`text-right p-2 ${f.side === 'buy' ? 'text-red-400' : 'text-blue-400'}`}>{f.side === 'buy' ? '매수' : '매도'}</td>
                  <td className="text-right p-2">{f.qty.toLocaleString()}</td>
                  <td className="text-right p-2">{f.price.toLocaleString()}</td>
                  <td className="text-right p-2 text-slate-500 font-mono">{f.time.slice(0, 6).replace(/(\d{2})(\d{2})(\d{2})/, '$1:$2:$3')}</td>
                </tr>
              ))}
              {fills.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-slate-500">당일 체결 없음</td></tr>}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
