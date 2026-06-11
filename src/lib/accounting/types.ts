/** 영림원 SystemEver 회계관리 — 공통 타입 */

export type AccountType = 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';

export type VoucherType =
  | 'general'      // 일반전표
  | 'sales'        // 매출전표
  | 'purchase'     // 구매전표
  | 'receipt'      // 입금전표
  | 'payment'      // 지급전표
  | 'cash'         // 출납전표
  | 'transfer';    // 대체전표

export type VoucherStatus = 'draft' | 'pending' | 'approved' | 'cancelled';

export interface AccountingAccount {
  id?: string;
  storeId: string;
  code: string;
  name: string;
  type: AccountType;
  parentCode?: string;
  /** 전표 기표 가능 */
  allowEntry: boolean;
  /** 건별반제 (채권·채무) */
  perItemOffset?: boolean;
  /** 관리항목 사용 (거래처 등) */
  usePartner?: boolean;
  /** 외부코드 (영림원) */
  externalCode?: string;
  /** 자금·예적금 등 자금조회 연동 */
  isFundAccount?: boolean;
  memo?: string;
  sortOrder: number;
  isActive: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface VoucherLine {
  lineNo: number;
  accountCode: string;
  accountName?: string;
  partnerCode?: string;
  partnerName?: string;
  debit: number;
  credit: number;
  memo?: string;
}

export interface AccountingVoucher {
  id?: string;
  storeId: string;
  voucherNo: string;
  voucherDate: string;
  voucherType: VoucherType;
  status: VoucherStatus;
  description?: string;
  lines: VoucherLine[];
  totalDebit: number;
  totalCredit: number;
  sourceType?: 'manual' | 'purchase' | 'pos';
  sourceId?: string;
  createdBy?: string;
  approvedBy?: string;
  approvedAt?: unknown;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface AccountingPeriod {
  storeId: string;
  period: string; // YYYY-MM
  closed: boolean;
  closedAt?: unknown;
  closedBy?: string;
}

export interface AccountingSettings {
  storeId: string;
  companyName?: string;
  businessNumber?: string;
  fiscalYearStart: number; // month 1-12
  voucherApprovalRequired: boolean;
  autoVoucherFromPurchase: boolean;
  autoVoucherFromSales: boolean;
  /** ERP 회사코드 (더존 등) */
  erpCompanyCode?: string;
  /** ERP 사업장코드 (영림원·더존) */
  erpBusinessPlaceCode?: string;
  /** 매입→전표 자동 분개 패턴 */
  purchaseVoucherPattern?: {
    splitVat: boolean;
    lines: Array<{
      side: 'debit' | 'credit';
      accountCode: string;
      accountName: string;
      amountKey: 'supply' | 'tax' | 'total';
    }>;
  };
  /** 매출→전표 자동 분개 패턴 */
  salesVoucherPattern?: {
    splitVat: boolean;
    lines: Array<{
      side: 'debit' | 'credit';
      accountCode: string;
      accountName: string;
      amountKey: 'supply' | 'tax' | 'total' | 'cash' | 'card';
    }>;
  };
}

export const ACCOUNT_TYPE_ORDER: AccountType[] = [
  'asset', 'liability', 'equity', 'revenue', 'expense',
];

export const ACCOUNT_TYPE_LABELS: Record<AccountType, string> = {
  asset: '자산',
  liability: '부채',
  equity: '자본',
  revenue: '수익',
  expense: '비용',
};

export const VOUCHER_TYPE_LABELS: Record<VoucherType, string> = {
  general: '일반전표',
  sales: '매출전표',
  purchase: '구매전표',
  receipt: '입금전표',
  payment: '지급전표',
  cash: '출납전표',
  transfer: '대체전표',
};

export const VOUCHER_STATUS_LABELS: Record<VoucherStatus, string> = {
  draft: '작성중',
  pending: '승인대기',
  approved: '승인',
  cancelled: '취소',
};
