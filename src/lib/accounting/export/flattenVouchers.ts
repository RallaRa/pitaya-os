import type { AccountingAccount, AccountingVoucher } from '@/lib/accounting/types';
import type { FlatJournalRow } from './types';

export function buildAccountExternalMap(accounts: AccountingAccount[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const acc of accounts) {
    const code = String(acc.code || '').trim();
    if (!code) continue;
    map.set(code, String(acc.externalCode || code).trim());
  }
  return map;
}

export function flattenVouchersToJournalRows(
  vouchers: AccountingVoucher[],
  externalByCode: Map<string, string>,
): FlatJournalRow[] {
  const rows: FlatJournalRow[] = [];

  for (const voucher of vouchers) {
    const lines = Array.isArray(voucher.lines) ? voucher.lines : [];
    for (const line of lines) {
      const accountCode = String(line.accountCode || '').trim();
      rows.push({
        voucherId: String(voucher.id || ''),
        voucherDate: String(voucher.voucherDate || ''),
        voucherNo: String(voucher.voucherNo || ''),
        voucherType: voucher.voucherType,
        voucherDescription: String(voucher.description || ''),
        status: voucher.status,
        lineNo: Number(line.lineNo || 0),
        accountCode,
        accountName: String(line.accountName || ''),
        externalAccountCode: externalByCode.get(accountCode) || accountCode,
        partnerCode: String(line.partnerCode || ''),
        partnerName: String(line.partnerName || ''),
        deptCode: String(line.deptCode || ''),
        projectCode: String(line.projectCode || ''),
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        lineMemo: String(line.memo || ''),
      });
    }
  }

  return rows.sort((a, b) => {
    const dateCmp = a.voucherDate.localeCompare(b.voucherDate);
    if (dateCmp !== 0) return dateCmp;
    const noCmp = a.voucherNo.localeCompare(b.voucherNo);
    if (noCmp !== 0) return noCmp;
    return a.lineNo - b.lineNo;
  });
}

export function toYmdCompact(date: string): string {
  return date.replace(/-/g, '').slice(0, 8);
}
