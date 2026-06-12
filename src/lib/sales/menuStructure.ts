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
  description?: string;
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
      { href: '/dashboard/report/view', label: '일마감내역', description: '일별 매출·마감 확인' },
      { href: '/dashboard/report/calendar', label: '달력매출', description: '월간 매출 달력' },
      { href: '/dashboard/report/anomalies', label: '매출 이상 탐지', description: '비정상 매출 알림' },
      { href: '/dashboard/report/monthly', label: '월간 리포트', description: '월별 종합 리포트' },
    ],
  },
  {
    id: 'manual',
    label: '매출 키인',
    permission: 'salesManual',
    items: [
      { href: '/dashboard/report/input', label: '매출 키인', description: '수동 매출 입력', manualOnly: true },
      { href: '/dashboard/report/sales_ai', label: '판매내역 분석', description: '키인 매출 AI 분석', manualOnly: true },
    ],
  },
  {
    id: 'analysis',
    label: '분석·예측',
    permission: 'salesAnalysis',
    items: [
      { href: '/dashboard/sales-forecast', label: '품목별 매출 추이', description: '품목별 판매 추세' },
      { href: '/dashboard/prediction-analysis', label: '예측분석', description: 'AI 매출 예측' },
      { href: '/dashboard/settings/prediction-variables', label: 'AI 예측 변수', description: '예측 모델 변수 조정' },
    ],
  },
  {
    id: 'customer',
    label: '고객',
    permission: 'salesCustomer',
    items: [
      { href: '/dashboard/customers', label: '고객 관리', description: '회원·포인트 관리' },
      { href: '/dashboard/marketing/journey', label: '고객 여정', description: '마케팅 자동화 흐름' },
      { href: '/dashboard/marketing/online-presence', label: '온라인 언급', description: '네이버·웹 관련 콘텐츠' },
    ],
  },
  {
    id: 'promotion',
    label: '판촉·주문',
    permission: 'salesPromotion',
    items: [
      { href: '/dashboard/coupons', label: '쿠폰·할인', description: '프로모션·쿠폰 설정' },
      { href: '/dashboard/public-orders', label: '공개 주문', description: '온라인 주문 접수' },
      { href: '/dashboard/orders/templates', label: '발주 템플릿', description: '정기 발주 템플릿' },
      { href: '/dashboard/signage', label: '사이니지', description: 'TV 콘텐츠·AI 쇼' },
    ],
  },
  {
    id: 'scale',
    label: '저울·PLU',
    permission: 'salesScale',
    items: [
      { href: '/dashboard/scale', label: '저울 코드 관리', description: 'PLU·저울 바코드' },
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

export function findSalesMenuItem(pathname: string): SalesMenuItem | undefined {
  return flattenSalesMenu({ salesMgmt: true }).find(
    i => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
}

export function findSalesSection(pathname: string): SalesMenuSection | undefined {
  return SALES_MENU_SECTIONS.find(s =>
    s.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
}

export function hasSalesMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
): boolean {
  return canAccessSalesSection(menuAccess, 'salesMgmt');
}

export function isSalesPath(pathname: string): boolean {
  if (pathname.startsWith('/dashboard/report/purchases')) return false;
  if (pathname.startsWith('/dashboard/sales-mgmt')) return true;
  if (pathname.startsWith('/dashboard/report/view')
    || pathname.startsWith('/dashboard/report/calendar')
    || pathname.startsWith('/dashboard/report/input')
    || pathname.startsWith('/dashboard/report/sales_ai')
    || pathname.startsWith('/dashboard/report/anomalies')
    || pathname.startsWith('/dashboard/report/monthly')) {
    return true;
  }
  return pathname.startsWith('/dashboard/sales-forecast')
    || pathname.startsWith('/dashboard/prediction-analysis')
    || pathname.startsWith('/dashboard/prediction-history')
    || pathname.startsWith('/dashboard/customers')
    || pathname.startsWith('/dashboard/marketing')
    || pathname.startsWith('/dashboard/coupons')
    || pathname.startsWith('/dashboard/public-orders')
    || pathname.startsWith('/dashboard/orders/templates')
    || pathname.startsWith('/dashboard/signage')
    || pathname.startsWith('/dashboard/scale')
    || pathname.startsWith('/dashboard/settings/prediction-variables');
}
