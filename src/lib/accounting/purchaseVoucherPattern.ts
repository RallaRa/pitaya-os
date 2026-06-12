import type { VoucherLine } from '@/lib/accounting/types';
import type { AutoVoucherPattern, AutoVoucherPatternLine } from '@/lib/accounting/autoVoucherPattern';
export type { AutoVoucherPattern as PurchaseVoucherPattern, AutoVoucherPatternLine as PurchaseVoucherPatternLine };
export { previewAutoPatternSummary as previewPatternSummary, AMOUNT_KEY_LABELS, PURCHASE_AMOUNT_KEYS } from '@/lib/accounting/autoVoucherPattern';

/** 정육·소매 매입 기본 분개: 상품(차) + 부가세대급(차) / 외상매입금(대) */
export const DEFAULT_PURCHASE_VOUCHER_PATTERN: AutoVoucherPattern = {
  splitVat: true,
  lines: [
    { side: 'debit', accountCode: '146', accountName: '상품', amountKey: 'supply' },
    { side: 'debit', accountCode: '135', accountName: '부가세대급금', amountKey: 'tax' },
    { side: 'credit', accountCode: '251', accountName: '외상매입금', amountKey: 'total' },
  ],
};

export interface PurchaseVoucherSource {
  id: string;
  purchaseDate: string;
  supplierName: string;
  invoiceNumber?: string;
  supplyAmount: number;
  taxAmount: number;
  totalAmount: number;
  memo?: string;
}

function resolveAmount(key: AutoVoucherPatternLine['amountKey'], purchase: PurchaseVoucherSource): number {
  const supply = Number(purchase.supplyAmount || 0);
  const tax = Number(purchase.taxAmount || 0);
  const total = Number(purchase.totalAmount || 0) || supply + tax;

  if (key === 'supply') return supply > 0 ? supply : Math.max(total - tax, 0);
  if (key === 'tax') return tax;
  if (key === 'cash' || key === 'card') return 0;
  return total;
}

export function buildPurchaseVoucherLines(
  purchase: PurchaseVoucherSource,
  pattern: AutoVoucherPattern,
  accountNames?: Map<string, string>,
): VoucherLine[] {
  const partnerName = String(purchase.supplierName || '').trim();
  const description = [
    purchase.supplierName,
    purchase.invoiceNumber ? `#${purchase.invoiceNumber}` : '',
    purchase.memo,
  ].filter(Boolean).join(' ').trim();

  const activeLines = pattern.splitVat
    ? pattern.lines
    : pattern.lines.filter(l => l.amountKey !== 'tax');

  const voucherLines: VoucherLine[] = [];
  let lineNo = 1;

  for (const pl of activeLines) {
    const amount = resolveAmount(pl.amountKey, purchase);
    if (amount <= 0) continue;

    const accountName = accountNames?.get(pl.accountCode) || pl.accountName;
    voucherLines.push({
      lineNo: lineNo++,
      accountCode: pl.accountCode,
      accountName,
      partnerCode: pl.side === 'credit' && partnerName ? partnerName.slice(0, 20) : '',
      partnerName: pl.side === 'credit' ? partnerName : '',
      debit: pl.side === 'debit' ? amount : 0,
      credit: pl.side === 'credit' ? amount : 0,
      memo: description,
    });
  }

  if (voucherLines.length < 2) {
    const total = resolveAmount('total', purchase);
    return [
      {
        lineNo: 1,
        accountCode: '146',
        accountName: accountNames?.get('146') || '상품',
        partnerName: '',
        partnerCode: '',
        debit: total,
        credit: 0,
        memo: description,
      },
      {
        lineNo: 2,
        accountCode: '251',
        accountName: accountNames?.get('251') || '외상매입금',
        partnerName,
        partnerCode: partnerName ? partnerName.slice(0, 20) : '',
        debit: 0,
        credit: total,
        memo: description,
      },
    ];
  }

  return voucherLines;
}

