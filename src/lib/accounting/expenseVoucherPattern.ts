import type { VoucherLine } from '@/lib/accounting/types';
import { classifyExpenseByMerchant } from '@/lib/accounting/expenseMerchantMap';

export interface ExpenseVoucherSource {
  id: string;
  txnDate: string;
  merchantName: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  memo?: string;
}

export function buildExpenseVoucherLines(
  source: ExpenseVoucherSource,
  accountNames: Map<string, string>,
): VoucherLine[] {
  const pick = classifyExpenseByMerchant(source.merchantName);
  const expenseName = accountNames.get(pick.accountCode) || pick.accountName;
  const cardName = accountNames.get('103') || '보통예금';

  const supply = source.supplyAmount > 0
    ? source.supplyAmount
    : Math.max(source.totalAmount - (source.taxAmount || 0), 0);
  const tax = source.taxAmount > 0 ? source.taxAmount : 0;
  const total = source.totalAmount > 0 ? source.totalAmount : supply + tax;

  const lines: VoucherLine[] = [
    {
      lineNo: 1,
      accountCode: pick.accountCode,
      accountName: expenseName,
      debit: total,
      credit: 0,
      memo: source.merchantName,
    },
    {
      lineNo: 2,
      accountCode: '103',
      accountName: cardName,
      debit: 0,
      credit: total,
      memo: '카드결제',
    },
  ];

  return lines;
}
