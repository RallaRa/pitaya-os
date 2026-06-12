/**
 * 영림원 SystemEver WP 회계관리 메뉴 트리
 * @see SystemEver 회계관리 — 기본정보 / 전표 / 장부 / 결산 / 자금
 */
import type { MenuAccessKey } from '@/lib/menuAccessKeys';

export type AccountingPermissionKey =
  | 'accounting'
  | 'accountingMaster'
  | 'accountingVoucher'
  | 'accountingLedger'
  | 'accountingClosing'
  | 'accountingFund';

export interface AccountingMenuItem {
  href: string;
  label: string;
  description?: string;
}

export interface AccountingMenuSection {
  id: string;
  label: string;
  /** 권한 그룹 menuAccess 키 */
  permission: AccountingPermissionKey;
  items: AccountingMenuItem[];
}

export const ACCOUNTING_MENU_SECTIONS: AccountingMenuSection[] = [
  {
    id: 'basic',
    label: '기본정보',
    permission: 'accountingMaster',
    items: [
      { href: '/dashboard/accounting/basic/settings', label: '회계환경설정', description: '결산주체·회계연도·전표승인' },
      { href: '/dashboard/accounting/basic/accounts', label: '계정과목 등록', description: '계정코드·명칭·전표기표' },
      { href: '/dashboard/accounting/basic/account-structure', label: '계정과목 구조', description: '자산·부채·자본·손익 구조' },
      { href: '/dashboard/accounting/basic/voucher-types', label: '전표유형 등록', description: '일반·매출·구매·입금·지급' },
      { href: '/dashboard/accounting/basic/management-items', label: '관리항목 등록', description: '거래처·부서·프로젝트' },
    ],
  },
  {
    id: 'voucher',
    label: '전표',
    permission: 'accountingVoucher',
    items: [
      { href: '/dashboard/accounting/voucher/entry', label: '전표입력', description: '일반·매출·구매·입출금 전표' },
      { href: '/dashboard/accounting/voucher/auto-process', label: '자동전표처리', description: '매입·매출 연동 분개 검토·승인' },
      { href: '/dashboard/accounting/voucher/approval', label: '전표승인', description: '승인대기 전표 검토·승인' },
      { href: '/dashboard/accounting/voucher/inquiry', label: '전표조회', description: '기간·유형·계정별 조회' },
    ],
  },
  {
    id: 'ledger',
    label: '장부',
    permission: 'accountingLedger',
    items: [
      { href: '/dashboard/accounting/ledger/journal', label: '분개장', description: '전표별 차·대변 분개 내역' },
      { href: '/dashboard/accounting/ledger/general', label: '총계정원장', description: '계정별 집계·잔액' },
      { href: '/dashboard/accounting/ledger/by-account', label: '계정별원장', description: '계정 상세 거래내역' },
      { href: '/dashboard/accounting/ledger/by-partner', label: '거래처원장', description: '건별반제·채권채무' },
      { href: '/dashboard/accounting/ledger/balance', label: '계정별잔액현황', description: '기간별 잔액 조회' },
    ],
  },
  {
    id: 'closing',
    label: '결산',
    permission: 'accountingClosing',
    items: [
      { href: '/dashboard/accounting/closing/monthly', label: '월마감', description: '월차 결산·장부 마감' },
      { href: '/dashboard/accounting/closing/trial-balance', label: '시산표', description: '수정 전·후 시산표' },
      { href: '/dashboard/accounting/closing/balance-sheet', label: '재무상태표', description: '자산·부채·자본' },
      { href: '/dashboard/accounting/closing/income-statement', label: '손익계산서', description: '수익·비용·당기순이익' },
    ],
  },
  {
    id: 'fund',
    label: '자금',
    permission: 'accountingFund',
    items: [
      { href: '/dashboard/accounting/fund/cash', label: '입출금전표', description: '출납·계좌 입출금' },
      { href: '/dashboard/accounting/fund/accounts', label: '계좌별잔액', description: '예금·현금성 계정' },
      { href: '/dashboard/accounting/fund/payment-schedule', label: '지급예정현황', description: '지급예정일·예상금액' },
    ],
  },
  {
    id: 'integration',
    label: '연동',
    permission: 'accountingVoucher',
    items: [
      { href: '/dashboard/accounting/integration/auto', label: '자동전표', description: '매입·매출 원장 선택·분개 패턴·전표 일괄생성' },
    ],
  },
];

export const ACCOUNTING_PERMISSION_KEYS: AccountingPermissionKey[] = [
  'accounting',
  'accountingMaster',
  'accountingVoucher',
  'accountingLedger',
  'accountingClosing',
  'accountingFund',
];

export const ACCOUNTING_PERMISSION_LABELS: Record<AccountingPermissionKey, string> = {
  accounting: '회계 모듈 (개요)',
  accountingMaster: '회계·기본정보',
  accountingVoucher: '회계·전표',
  accountingLedger: '회계·장부',
  accountingClosing: '회계·결산',
  accountingFund: '회계·자금',
};

/** 섹션 접근 — 모듈 또는 해당 세부 권한 */
export function canAccessAccountingSection(
  menuAccess: Partial<Record<MenuAccessKey, boolean>>,
  permission: AccountingPermissionKey,
): boolean {
  if (menuAccess.accountingMaster && permission === 'accountingMaster') return true;
  if (menuAccess.accountingVoucher && permission === 'accountingVoucher') return true;
  if (menuAccess.accountingLedger && permission === 'accountingLedger') return true;
  if (menuAccess.accountingClosing && permission === 'accountingClosing') return true;
  if (menuAccess.accountingFund && permission === 'accountingFund') return true;
  if (menuAccess.accounting) return true;
  return !!menuAccess[permission as MenuAccessKey];
}

export function flattenAccountingMenu(): AccountingMenuItem[] {
  return ACCOUNTING_MENU_SECTIONS.flatMap(s => s.items);
}

export function findAccountingMenuItem(pathname: string): AccountingMenuItem | undefined {
  return flattenAccountingMenu().find(i => pathname === i.href || pathname.startsWith(`${i.href}/`));
}

export function findAccountingSection(pathname: string): AccountingMenuSection | undefined {
  return ACCOUNTING_MENU_SECTIONS.find(s =>
    s.items.some(i => pathname === i.href || pathname.startsWith(`${i.href}/`)),
  );
}
