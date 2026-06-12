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
  { href: '/dashboard/superuser/stock/settings', label: '설정' },
];

export function isStockSuperuserPath(pathname: string): boolean {
  return pathname === '/dashboard/superuser/stock'
    || pathname.startsWith('/dashboard/superuser/stock/');
}

export function isStockSuperuserLinkActive(pathname: string, link: StockSuperuserLink): boolean {
  if (link.exact) return pathname === link.href;
  return pathname === link.href || pathname.startsWith(`${link.href}/`);
}
