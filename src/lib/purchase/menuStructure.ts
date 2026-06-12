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
  description?: string;
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
      { href: '/dashboard/report/purchases/input', label: '매입 등록', description: '명세서·OCR 매입 입력' },
      { href: '/dashboard/report/purchases/reconciliation', label: '증빙 3자 대조', description: '카드·현금영수증·세금계산서 대조' },
      { href: '/dashboard/report/purchases/tax-invoice', label: '(세금)계산서 처리', description: '증빙·실물 대조 후 자동전표 전송' },
      { href: '/dashboard/report/purchases/ledger', label: '매입 원장', description: '기간별 매입 집계' },
      { href: '/dashboard/report/purchases/by-supplier', label: '거래처별 매입', description: '공급처별 매입 현황' },
    ],
  },
  {
    id: 'analysis',
    label: '단가·분석',
    permission: 'purchaseAnalysis',
    items: [
      { href: '/dashboard/report/purchases/prices', label: '품목별 단가', description: '품목 매입단가 추이' },
      { href: '/dashboard/report/purchases/unit-price-detail', label: '매입 단가 상세', description: '건당 단가 내역' },
      { href: '/dashboard/report/purchases/price-analysis', label: '매입단가 분석', description: '단가 변동·이상 탐지' },
      { href: '/dashboard/suppliers/price-compare', label: '거래처 단가 비교', description: '공급처 간 단가 비교' },
    ],
  },
  {
    id: 'compliance',
    label: '법정·이력',
    permission: 'purchaseCompliance',
    items: [
      { href: '/dashboard/report/purchases/trace-ledger', label: '거래내역서(법정)', description: '축산물 이력 거래내역' },
      { href: '/dashboard/report/purchases/trace-numbers', label: '이력번호 관리', description: '이력·묶음번호 추적' },
    ],
  },
  {
    id: 'master',
    label: '마스터',
    permission: 'purchaseMaster',
    items: [
      { href: '/dashboard/suppliers', label: '거래처 관리', description: '매입 거래처 등록·수정' },
      { href: '/dashboard/items', label: '품목관리', description: '품목·단가·마진 설정' },
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

export function findPurchaseMenuItem(pathname: string): PurchaseMenuItem | undefined {
  return flattenPurchaseMenu({ purchaseMgmt: true }).find(
    i => pathname === i.href || pathname.startsWith(`${i.href}/`),
  );
}

export function findPurchaseSection(pathname: string): PurchaseMenuSection | undefined {
  return PURCHASE_MENU_SECTIONS.find(s =>
    s.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
}

export function hasPurchaseMenu(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
): boolean {
  return canAccessPurchaseSection(menuAccess, 'purchaseMgmt');
}

export function isPurchasePath(pathname: string): boolean {
  return pathname.startsWith('/dashboard/purchase-mgmt')
    || pathname.startsWith('/dashboard/report/purchases')
    || pathname.startsWith('/dashboard/suppliers')
    || pathname.startsWith('/dashboard/items');
}
