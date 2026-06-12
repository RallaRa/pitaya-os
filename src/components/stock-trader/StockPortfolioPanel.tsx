'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Loader2, Wallet } from 'lucide-react';
import { useStockTraderApi } from '@/components/stock-trader/useStockTraderApi';
import type { KisPortfolio } from '@/lib/stock-trader/kisPortfolio';

export default function StockPortfolioPanel() {
  const { call, loading, error } = useStockTraderApi();
  const [portfolio, setPortfolio] = useState<KisPortfolio | null>(null);

  useEffect(() => {
    void call<{ portfolio: KisPortfolio }>('kis/portfolio')
      .then(r => setPortfolio(r.portfolio))
      .catch(() => {});
  }, [call]);

  if (loading && !portfolio) {
    return (
      <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 p-6 flex justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-slate-500" />
      </div>
    );
  }

  if (error && !portfolio) {
    return (
      <div className="rounded-xl border border-red-500/30 bg-red-900/10 p-4 text-red-300 text-sm">
        잔고 조회 실패: {error}
      </div>
    );
  }

  if (!portfolio) return null;

  const fmt = (n: number) => n.toLocaleString('ko-KR');
  const pnlUp = portfolio.totalPnl >= 0;

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-900/50 overflow-hidden">
      <div className="px-4 py-3 border-b border-slate-800 flex items-center gap-2">
        <Wallet className="w-4 h-4 text-teal-400" />
        <p className="text-sm font-medium text-white">계좌 · 보유종목</p>
      </div>

      <div className="p-4 grid sm:grid-cols-3 gap-3 text-sm">
        <div>
          <p className="text-xs text-slate-500">예수금</p>
          <p className="text-lg font-bold text-white">{fmt(portfolio.cash)}원</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">총 평가</p>
          <p className="text-lg font-bold text-white">{fmt(portfolio.totalEval)}원</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">총 손익</p>
          <p className={`text-lg font-bold ${pnlUp ? 'text-red-400' : 'text-blue-400'}`}>
            {pnlUp ? '+' : ''}{fmt(portfolio.totalPnl)} ({portfolio.totalPnlPct.toFixed(2)}%)
          </p>
        </div>
      </div>

      {portfolio.holdings.length === 0 ? (
        <p className="px-4 pb-4 text-sm text-slate-500">보유 종목 없음</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm">
            <thead>
              <tr className="text-slate-500 border-t border-slate-800">
                <th className="text-left px-4 py-2 font-medium">종목</th>
                <th className="text-right px-2 py-2 font-medium">수량</th>
                <th className="text-right px-2 py-2 font-medium hidden sm:table-cell">평단</th>
                <th className="text-right px-2 py-2 font-medium">현재가</th>
                <th className="text-right px-4 py-2 font-medium">손익</th>
              </tr>
            </thead>
            <tbody>
              {portfolio.holdings.map(h => (
                <tr key={h.symbol} className="border-t border-slate-800/60 hover:bg-slate-800/30">
                  <td className="px-4 py-2.5">
                    <Link
                      href={`/dashboard/stock-trader/trade?symbol=${h.symbol}`}
                      className="text-white font-medium hover:text-teal-300"
                    >
                      {h.name || h.symbol}
                    </Link>
                    <p className="text-[10px] text-slate-500 font-mono">{h.symbol}</p>
                  </td>
                  <td className="text-right px-2 text-slate-300">{fmt(h.qty)}</td>
                  <td className="text-right px-2 text-slate-400 hidden sm:table-cell">{fmt(h.avgPrice)}</td>
                  <td className="text-right px-2 text-white">{fmt(h.currentPrice)}</td>
                  <td className={`text-right px-4 ${h.pnlPct >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                    {h.pnlPct >= 0 ? '+' : ''}{h.pnlPct.toFixed(2)}%
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
