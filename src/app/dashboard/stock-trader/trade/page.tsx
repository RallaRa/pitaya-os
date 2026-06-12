import { Suspense } from 'react';
import StockMtsTerminal from '@/components/stock-trader/StockMtsTerminal';

export default function StockTraderTradePage() {
  return (
    <Suspense fallback={<div className="p-6 text-slate-400 text-sm">MTS 로딩…</div>}>
      <StockMtsTerminal />
    </Suspense>
  );
}
