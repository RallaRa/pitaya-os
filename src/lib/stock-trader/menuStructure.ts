/** KIS AI 자동매매 — Pitaya 사이드바·서브네비 (슈퍼유저 전용) */

export interface StockTraderSidebarLink {
  href: string;
  label: string;
  exact?: boolean;
}

export const STOCK_TRADER_SIDEBAR_LINKS: StockTraderSidebarLink[] = [
  { href: '/dashboard/stock-trader', label: '현황', exact: true },
  { href: '/dashboard/stock-trader/trade', label: 'MTS' },
  { href: '/dashboard/stock-trader/ai', label: 'AI 자동' },
  { href: '/dashboard/stock-trader/logs', label: '실행 로그' },
  { href: '/dashboard/stock-trader/settings', label: '연동 설정' },
];

export function isStockTraderPath(pathname: string): boolean {
  return pathname === '/dashboard/stock-trader' || pathname.startsWith('/dashboard/stock-trader/');
}

export function isStockTraderSubLinkActive(pathname: string, link: StockTraderSidebarLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
