import type { Metadata, Viewport } from 'next';
import StockSuperuserSubNav from '@/components/stock/StockSuperuserSubNav';
import StockSuperuserGuard from '@/components/stock/StockSuperuserGuard';
import StockPwaRegister from '@/components/stock/StockPwaRegister';

export const metadata: Metadata = {
  title: 'AI 자동주식 | Pitaya OS',
  manifest: '/manifest-stock.json',
  appleWebApp: {
    capable: true,
    title: 'Pitaya Stock',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#020617',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
};

export default function StockSuperuserLayout({ children }: { children: React.ReactNode }) {
  return (
    <StockSuperuserGuard>
      <StockPwaRegister />
      <div className="flex flex-col min-h-[calc(100dvh-4rem)] bg-slate-950 pb-24 md:pb-0">
        <StockSuperuserSubNav />
        <div className="flex-1 min-h-0 overflow-y-auto">{children}</div>
      </div>
    </StockSuperuserGuard>
  );
}
