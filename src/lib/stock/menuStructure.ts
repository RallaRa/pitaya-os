/** 슈퍼유저 AI 주식 — 사이드바·서브네비 */

export interface StockSuperuserLink {
  href: string;
  label: string;
  exact?: boolean;
}

export const STOCK_SUPERUSER_LINKS: StockSuperuserLink[] = [
  { href: '/dashboard/superuser/stock', label: '대시보드', exact: true },
  { href: '/dashboard/superuser/stock/ai-engine', label: 'AI 엔진' },
  { href: '/dashboard/superuser/stock/backtest', label: '백테스팅' },
  { href: '/dashboard/superuser/stock/journal', label: '매매일지' },
  { href: '/dashboard/stock-trader/trade', label: 'MTS' },
  { href: '/dashboard/stock-trader/ai', label: 'AI 자동' },
  { href: '/dashboard/stock-trader/logs', label: '실행 로그' },
  { href: '/dashboard/superuser/stock/settings', label: '설정' },
  { href: '/dashboard', label: 'Pitaya 메인', exact: true },
];

export function isStockSuperuserPath(pathname: string): boolean {
  return pathname === '/dashboard/superuser/stock'
    || pathname.startsWith('/dashboard/superuser/stock/')
    || pathname === '/dashboard/stock-trader'
    || pathname.startsWith('/dashboard/stock-trader/');
}

export function isStockSuperuserLinkActive(pathname: string, link: StockSuperuserLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
