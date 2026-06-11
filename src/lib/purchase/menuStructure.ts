import type { MenuAccessKey } from '@/lib/menuAccessKeys';

export type PurchasePermissionKey =
  | 'purchaseMgmt'
  | 'purchaseInput'
  | 'purchaseAnalysis'
  | 'purchaseCompliance'
  | 'purchaseMaster';

export interface PurchaseMenuItem {
  href: string;
  label: string;
}

export interface PurchaseMenuSection {
  id: string;
  label: string;
  permission: PurchasePermissionKey;
  items: PurchaseMenuItem[];
}

export const PURCHASE_MENU_SECTIONS: PurchaseMenuSection[] = [
  {
    id: 'input',
    label: '매입',
    permission: 'purchaseInput',
    items: [
      { href: '/dashboard/report/purchases/input', label: '매입 등록' },
      { href: '/dashboard/report/purchases/ledger', label: '매입 원장' },
      { href: '/dashboard/report/purchases/by-supplier', label: '거래처별 매입' },
    ],
  },
  {
    id: 'analysis',
    label: '단가·분석',
    permission: 'purchaseAnalysis',
    items: [
      { href: '/dashboard/report/purchases/prices', label: '품목별 단가' },
      { href: '/dashboard/report/purchases/unit-price-detail', label: '매입 단가 상세' },
      { href: '/dashboard/report/purchases/price-analysis', label: '매입단가 분석' },
    ],
  },
  {
    id: 'compliance',
    label: '법정·이력',
    permission: 'purchaseCompliance',
    items: [
      { href: '/dashboard/report/purchases/trace-ledger', label: '거래내역서(법정)' },
      { href: '/dashboard/report/purchases/trace-numbers', label: '이력번호 관리' },
    ],
  },
  {
    id: 'master',
    label: '마스터',
    permission: 'purchaseMaster',
    items: [
      { href: '/dashboard/suppliers', label: '거래처 관리' },
      { href: '/dashboard/items', label: '품목관리' },
    ],
  },
];

export const PURCHASE_PERMISSION_LABELS: Record<PurchasePermissionKey, string> = {
  purchaseMgmt: '구매관리 (전체)',
  purchaseInput: '구매·매입',
  purchaseAnalysis: '구매·단가분석',
  purchaseCompliance: '구매·법정기록',
  purchaseMaster: '구매·마스터',
};

/** 섹션 접근 — 신규 키 + 레거시(purchase, suppliers, items) 호환 */
export function canAccessPurchaseSection(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
  permission: PurchasePermissionKey,
): boolean {
  if (menuAccess.purchaseMgmt) return true;
  if (menuAccess.purchase) return true;

  switch (permission) {
    case 'purchaseMgmt':
      return !!(
        menuAccess.purchaseInput
        || menuAccess.purchaseAnalysis
        || menuAccess.purchaseCompliance
        || menuAccess.purchaseMaster
        || menuAccess.suppliers
        || menuAccess.items
      );
    case 'purchaseInput':
      return !!(menuAccess.purchaseInput || menuAccess.purchase);
    case 'purchaseAnalysis':
      return !!(menuAccess.purchaseAnalysis || menuAccess.purchase);
    case 'purchaseCompliance':
      return !!(menuAccess.purchaseCompliance || menuAccess.purchase);
    case 'purchaseMaster':
      return !!(
        menuAccess.purchaseMaster
        || menuAccess.suppliers
        || menuAccess.items
      );
    default:
      return !!menuAccess[permission as MenuAccessKey];
  }
}

export function flattenPurchaseMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
): PurchaseMenuItem[] {
  return PURCHASE_MENU_SECTIONS
    .filter(s => canAccessPurchaseSection(menuAccess, s.permission))
    .flatMap(s => s.items);
}

export function hasPurchaseMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
): boolean {
  return canAccessPurchaseSection(menuAccess, 'purchaseMgmt');
}

export function isPurchasePath(pathname: string): boolean {
  return pathname.startsWith('/dashboard/report/purchases')
    || pathname.startsWith('/dashboard/suppliers')
    || pathname.startsWith('/dashboard/items');
}
