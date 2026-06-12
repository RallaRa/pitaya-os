import StockTraderSubNav from '@/components/stock-trader/StockTraderSubNav';
import StockTraderGuard from '@/components/stock-trader/StockTraderGuard';

export default function StockTraderLayout({ children }: { children: React.ReactNode }) {
  return (
    <StockTraderGuard>
      <div className="flex flex-col min-h-[calc(100dvh-4rem)]">
        <StockTraderSubNav />
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </StockTraderGuard>
  );
}
