import type { VoucherLine } from '@/lib/accounting/types';
import type { AutoVoucherPattern, AutoVoucherPatternLine } from '@/lib/accounting/autoVoucherPattern';

export interface SalesVoucherSource {
  id: string;
  reportDate: string;
  netSales: number;
  totalSales: number;
  cashSale: number;
  cardSale: number;
  customerCount: number;
  source?: string;
  memo?: string;
}

export function resolveSalesAmounts(sale: SalesVoucherSource) {
  const total = Number(sale.netSales || sale.totalSales || 0);
  let cash = Number(sale.cashSale || 0);
  let card = Number(sale.cardSale || 0);
  const tax = total > 0 ? Math.round(total / 11) : 0;
  const supply = Math.max(total - tax, 0);

  if (total <= 0) return { supply, tax, total, cash, card };

  if (cash <= 0 && card <= 0) {
    card = total;
  } else {
    const payTotal = cash + card;
    if (payTotal !== total) {
      if (payTotal < total) {
        const diff = total - payTotal;
        if (card >= cash) card += diff;
        else cash += diff;
      } else {
        cash = Math.round((cash / payTotal) * total);
        card = total - cash;
      }
    }
  }

  return { supply, tax, total, cash, card };
}

function resolveAmount(
  key: AutoVoucherPatternLine['amountKey'],
  sale: SalesVoucherSource,
): number {
  const a = resolveSalesAmounts(sale);
  if (key === 'supply') return a.supply;
  if (key === 'tax') return a.tax;
  if (key === 'cash') return a.cash || (a.card ? 0 : a.total);
  if (key === 'card') return a.card;
  return a.total;
}

/** 매출 기본 분개: 현금/카드(차) / 상품매출+부가세예수금(대) */
export const DEFAULT_SALES_VOUCHER_PATTERN: AutoVoucherPattern = {
  splitVat: true,
  lines: [
    { side: 'debit', accountCode: '101', accountName: '현금', amountKey: 'cash' },
    { side: 'debit', accountCode: '103', accountName: '보통예금', amountKey: 'card' },
    { side: 'credit', accountCode: '401', accountName: '상품매출', amountKey: 'supply' },
    { side: 'credit', accountCode: '255', accountName: '부가세예수금', amountKey: 'tax' },
  ],
};

export function buildSalesVoucherLines(
  sale: SalesVoucherSource,
  pattern: AutoVoucherPattern,
  accountNames?: Map<string, string>,
): VoucherLine[] {
  const description = sale.memo || `일매출 ${sale.reportDate}${sale.customerCount ? ` · ${sale.customerCount}명` : ''}`;

  const activeLines = pattern.splitVat
    ? pattern.lines
    : pattern.lines.filter(l => l.amountKey !== 'tax');

  const voucherLines: VoucherLine[] = [];
  let lineNo = 1;

  for (const pl of activeLines) {
    const amount = resolveAmount(pl.amountKey, sale);
    if (amount <= 0) continue;

    voucherLines.push({
      lineNo: lineNo++,
      accountCode: pl.accountCode,
      accountName: accountNames?.get(pl.accountCode) || pl.accountName,
      partnerCode: '',
      partnerName: '',
      debit: pl.side === 'debit' ? amount : 0,
      credit: pl.side === 'credit' ? amount : 0,
      memo: description,
    });
  }

  if (voucherLines.length < 2) {
    const { total } = resolveSalesAmounts(sale);
    return [
      {
        lineNo: 1,
        accountCode: '103',
        accountName: accountNames?.get('103') || '보통예금',
        debit: total,
        credit: 0,
        partnerCode: '',
        partnerName: '',
        memo: description,
      },
      {
        lineNo: 2,
        accountCode: '401',
        accountName: accountNames?.get('401') || '상품매출',
        debit: 0,
        credit: total,
        partnerCode: '',
        partnerName: '',
        memo: description,
      },
    ];
  }

  return voucherLines;
}
