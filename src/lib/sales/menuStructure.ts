import type { MenuAccessKey } from '@/lib/menuAccessKeys';

export type SalesPermissionKey =
  | 'salesMgmt'
  | 'salesReport'
  | 'salesManual'
  | 'salesAnalysis'
  | 'salesCustomer'
  | 'salesPromotion'
  | 'salesScale';

export interface SalesMenuItem {
  href: string;
  label: string;
  /** POS 미연동 매장에서만 표시 */
  manualOnly?: boolean;
}

export interface SalesMenuSection {
  id: string;
  label: string;
  permission: SalesPermissionKey;
  items: SalesMenuItem[];
}

export const SALES_MENU_SECTIONS: SalesMenuSection[] = [
  {
    id: 'report',
    label: '매출·마감',
    permission: 'salesReport',
    items: [
      { href: '/dashboard/report/view', label: '일마감내역' },
      { href: '/dashboard/report/calendar', label: '달력매출' },
    ],
  },
  {
    id: 'manual',
    label: '매출 키인',
    permission: 'salesManual',
    items: [
      { href: '/dashboard/report/input', label: '매출 키인', manualOnly: true },
      { href: '/dashboard/report/sales_ai', label: '판매내역 분석', manualOnly: true },
    ],
  },
  {
    id: 'analysis',
    label: '분석·예측',
    permission: 'salesAnalysis',
    items: [
      { href: '/dashboard/sales-forecast', label: '품목별 매출 추이' },
      { href: '/dashboard/prediction-analysis', label: '예측분석' },
      { href: '/dashboard/settings/prediction-variables', label: 'AI 예측 변수' },
    ],
  },
  {
    id: 'customer',
    label: '고객',
    permission: 'salesCustomer',
    items: [
      { href: '/dashboard/customers', label: '고객 관리' },
      { href: '/dashboard/marketing/journey', label: '고객 여정' },
    ],
  },
  {
    id: 'promotion',
    label: '판촉·주문',
    permission: 'salesPromotion',
    items: [
      { href: '/dashboard/coupons', label: '쿠폰·할인' },
      { href: '/dashboard/public-orders', label: '공개 주문' },
      { href: '/dashboard/signage', label: '사이니지' },
    ],
  },
  {
    id: 'scale',
    label: '저울·PLU',
    permission: 'salesScale',
    items: [
      { href: '/dashboard/scale', label: '저울 코드 관리' },
    ],
  },
];

export const SALES_PERMISSION_LABELS: Record<SalesPermissionKey, string> = {
  salesMgmt: '영업관리 (전체)',
  salesReport: '영업·매출마감',
  salesManual: '영업·매출키인',
  salesAnalysis: '영업·분석예측',
  salesCustomer: '영업·고객',
  salesPromotion: '영업·판촉주문',
  salesScale: '영업·저울',
};

export function canAccessSalesSection(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
  permission: SalesPermissionKey,
): boolean {
  if (menuAccess.salesMgmt) return true;

  switch (permission) {
    case 'salesMgmt':
      return !!(
        menuAccess.salesReport
        || menuAccess.salesManual
        || menuAccess.salesAnalysis
        || menuAccess.salesCustomer
        || menuAccess.salesPromotion
        || menuAccess.salesScale
        || menuAccess.report
        || menuAccess.sales
        || menuAccess.salesForecast
        || menuAccess.customers
        || menuAccess.predictionHistory
        || menuAccess.predictionVariables
        || menuAccess.store
        || menuAccess.scaleCode
      );
    case 'salesReport':
      return !!(menuAccess.salesReport || menuAccess.report);
    case 'salesManual':
      return !!(menuAccess.salesManual || menuAccess.sales);
    case 'salesAnalysis':
      return !!(
        menuAccess.salesAnalysis
        || menuAccess.salesForecast
        || menuAccess.predictionHistory
        || menuAccess.predictionVariables
      );
    case 'salesCustomer':
      return !!(menuAccess.salesCustomer || menuAccess.customers);
    case 'salesPromotion':
      return !!(menuAccess.salesPromotion || menuAccess.store);
    case 'salesScale':
      return !!(menuAccess.salesScale || menuAccess.scaleCode);
    default:
      return !!menuAccess[permission as MenuAccessKey];
  }
}

export function flattenSalesMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
  opts?: { includeManual?: boolean },
): SalesMenuItem[] {
  const includeManual = opts?.includeManual ?? true;
  return SALES_MENU_SECTIONS
    .filter(s => canAccessSalesSection(menuAccess, s.permission))
    .flatMap(s => s.items.filter(it => includeManual || !it.manualOnly));
}

export function hasSalesMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
): boolean {
  return canAccessSalesSection(menuAccess, 'salesMgmt');
}

export function isSalesPath(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/report/purchases')) return false;
  if (pathname.startsWith('/dashboard/report/view')
    || pathname.startsWith('/dashboard/report/calendar')
    || pathname.startsWith('/dashboard/report/input')
    || pathname.startsWith('/dashboard/report/sales_ai')) {
    return true;
  }
  return pathname.startsWith('/dashboard/sales-forecast')
    || pathname.startsWith('/dashboard/prediction-analysis')
    || pathname.startsWith('/dashboard/prediction-history')
    || pathname.startsWith('/dashboard/customers')
    || pathname.startsWith('/dashboard/marketing')
    || pathname.startsWith('/dashboard/coupons')
    || pathname.startsWith('/dashboard/public-orders')
    || pathname.startsWith('/dashboard/signage')
    || pathname.startsWith('/dashboard/scale')
    || pathname.startsWith('/dashboard/settings/prediction-variables');
}
