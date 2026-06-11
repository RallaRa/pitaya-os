/** 매입·매출 자동전표 공통 분개 패턴 */

export type AutoVoucherAmountKey = 'supply' | 'tax' | 'total' | 'cash' | 'card';

export interface AutoVoucherPatternLine {
  side: 'debit' | 'credit';
  accountCode: string;
  accountName: string;
  amountKey: AutoVoucherAmountKey;
}

export interface AutoVoucherPattern {
  lines: AutoVoucherPatternLine[];
  splitVat: boolean;
}

export function previewAutoPatternSummary(pattern: AutoVoucherPattern): string {
  const debits = pattern.lines.filter(l => l.side === 'debit').map(l => `${l.accountName}(${l.accountCode})`).join(' + ');
  const credits = pattern.lines.filter(l => l.side === 'credit').map(l => `${l.accountName}(${l.accountCode})`).join(' + ');
  return `차변 ${debits || '—'} / 대변 ${credits || '—'}`;
}

export const AMOUNT_KEY_LABELS: Record<AutoVoucherAmountKey, string> = {
  supply: '공급가액',
  tax: '세액',
  total: '합계금액',
  cash: '현금매출',
  card: '카드매출',
};

export const PURCHASE_AMOUNT_KEYS: AutoVoucherAmountKey[] = ['supply', 'tax', 'total'];
export const SALES_AMOUNT_KEYS: AutoVoucherAmountKey[] = ['supply', 'tax', 'total', 'cash', 'card'];
