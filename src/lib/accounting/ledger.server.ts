import type { AccountType, AccountingAccount, AccountingVoucher } from '@/lib/accounting/types';
import { fetchAccountingVouchers, loadAccountingAccounts } from '@/lib/accounting/voucher.server';

export interface LedgerAccountSummary {
  accountCode: string;
  accountName: string;
  accountType: AccountType;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  balance: number;
}

export interface AccountLedgerRow {
  voucherDate: string;
  voucherNo: string;
  voucherType: string;
  description: string;
  partnerName: string;
  debit: number;
  credit: number;
  balance: number;
  memo: string;
}

export interface PartnerLedgerRow {
  accountCode: string;
  accountName: string;
  voucherDate: string;
  voucherNo: string;
  partnerName: string;
  debit: number;
  credit: number;
  balance: number;
  memo: string;
}

export function signedBalance(type: AccountType, debit: number, credit: number): number {
  if (type === 'asset' || type === 'expense') return debit - credit;
  return credit - debit;
}

function accumulateVouchers(
  accounts: AccountingAccount[],
  vouchers: AccountingVoucher[],
  startDate?: string,
  endDate?: string,
) {
  const accountMap = new Map(accounts.map(a => [String(a.code), a]));
  const summary = new Map<string, {
    accountCode: string;
    accountName: string;
    accountType: AccountType;
    openingDebit: number;
    openingCredit: number;
    periodDebit: number;
    periodCredit: number;
  }>();

  const ensure = (code: string, name?: string) => {
    if (!summary.has(code)) {
      const acc = accountMap.get(code);
      summary.set(code, {
        accountCode: code,
        accountName: acc?.name || name || code,
        accountType: acc?.type || 'asset',
        openingDebit: 0,
        openingCredit: 0,
        periodDebit: 0,
        periodCredit: 0,
      });
    }
    return summary.get(code)!;
  };

  for (const voucher of vouchers) {
    if (voucher.status !== 'approved') continue;
    const date = String(voucher.voucherDate || '');
    for (const line of voucher.lines || []) {
      const code = String(line.accountCode || '').trim();
      if (!code) continue;
      const row = ensure(code, line.accountName);
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);

      if (startDate && date < startDate) {
        row.openingDebit += debit;
        row.openingCredit += credit;
      } else if (!endDate || date <= endDate) {
        if (!startDate || date >= startDate) {
          row.periodDebit += debit;
          row.periodCredit += credit;
        }
      }
    }
  }

  return [...summary.values()]
    .map(row => ({
      ...row,
      balance: signedBalance(
        row.accountType,
        row.openingDebit + row.periodDebit,
        row.openingCredit + row.periodCredit,
      ),
    }))
    .filter(row =>
      row.openingDebit || row.openingCredit || row.periodDebit || row.periodCredit,
    )
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode));
}

export async function getGeneralLedger(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<LedgerAccountSummary[]> {
  const [accounts, vouchers] = await Promise.all([
    loadAccountingAccounts(storeId),
    fetchAccountingVouchers(storeId, { status: 'approved', endDate, limit: 1000 }),
  ]);
  return accumulateVouchers(accounts, vouchers, startDate, endDate);
}

export async function getAccountLedger(
  storeId: string,
  accountCode: string,
  startDate: string,
  endDate: string,
): Promise<{ account?: AccountingAccount; rows: AccountLedgerRow[]; balance: number }> {
  const [accounts, vouchers] = await Promise.all([
    loadAccountingAccounts(storeId),
    fetchAccountingVouchers(storeId, { status: 'approved', endDate, limit: 1000 }),
  ]);
  const account = accounts.find(a => String(a.code) === accountCode);
  const type = account?.type || 'asset';

  const prior = vouchers.filter(v => String(v.voucherDate) < startDate);
  let running = 0;
  for (const voucher of prior) {
    for (const line of voucher.lines || []) {
      if (String(line.accountCode) !== accountCode) continue;
      running += signedBalance(type, Number(line.debit || 0), Number(line.credit || 0));
    }
  }

  const rows: AccountLedgerRow[] = [];
  const periodVouchers = vouchers.filter(v => {
    const d = String(v.voucherDate);
    return d >= startDate && d <= endDate;
  });

  for (const voucher of periodVouchers) {
    for (const line of voucher.lines || []) {
      if (String(line.accountCode) !== accountCode) continue;
      const debit = Number(line.debit || 0);
      const credit = Number(line.credit || 0);
      running += signedBalance(type, debit, credit);
      rows.push({
        voucherDate: String(voucher.voucherDate),
        voucherNo: String(voucher.voucherNo),
        voucherType: String(voucher.voucherType),
        description: String(voucher.description || ''),
        partnerName: String(line.partnerName || ''),
        debit,
        credit,
        balance: running,
        memo: String(line.memo || voucher.description || ''),
      });
    }
  }

  return { account, rows, balance: running };
}

export async function getPartnerLedger(
  storeId: string,
  partnerQuery: string,
  startDate: string,
  endDate: string,
): Promise<PartnerLedgerRow[]> {
  const vouchers = await fetchAccountingVouchers(storeId, {
    status: 'approved',
    startDate,
    endDate,
    limit: 1000,
  });
  const q = partnerQuery.trim().toLowerCase();
  const rows: PartnerLedgerRow[] = [];

  for (const voucher of vouchers) {
    for (const line of voucher.lines || []) {
      const partnerName = String(line.partnerName || '').trim();
      const partnerCode = String(line.partnerCode || '').trim();
      if (!partnerName && !partnerCode) continue;
      if (q) {
        const hay = `${partnerName} ${partnerCode}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      rows.push({
        accountCode: String(line.accountCode || ''),
        accountName: String(line.accountName || ''),
        voucherDate: String(voucher.voucherDate),
        voucherNo: String(voucher.voucherNo),
        partnerName: partnerName || partnerCode,
        debit: Number(line.debit || 0),
        credit: Number(line.credit || 0),
        balance: Number(line.debit || 0) - Number(line.credit || 0),
        memo: String(line.memo || voucher.description || ''),
      });
    }
  }

  return rows.sort((a, b) => a.voucherDate.localeCompare(b.voucherDate));
}

export async function getAccountBalances(
  storeId: string,
  asOf: string,
): Promise<LedgerAccountSummary[]> {
  const startDate = '1970-01-01';
  return getGeneralLedger(storeId, startDate, asOf);
}

export async function getTrialBalance(storeId: string, endDate: string) {
  const rows = await getGeneralLedger(storeId, '1970-01-01', endDate);
  const totalDebit = rows.reduce((s, r) => s + r.openingDebit + r.periodDebit, 0);
  const totalCredit = rows.reduce((s, r) => s + r.openingCredit + r.periodCredit, 0);
  return { rows, totalDebit, totalCredit, balanced: totalDebit === totalCredit };
}

export async function getBalanceSheet(storeId: string, asOf: string) {
  const rows = await getAccountBalances(storeId, asOf);
  const sections = {
    asset: rows.filter(r => r.accountType === 'asset'),
    liability: rows.filter(r => r.accountType === 'liability'),
    equity: rows.filter(r => r.accountType === 'equity'),
  };
  const totalAssets = sections.asset.reduce((s, r) => s + r.balance, 0);
  const totalLiabilities = sections.liability.reduce((s, r) => s + r.balance, 0);
  const totalEquity = sections.equity.reduce((s, r) => s + r.balance, 0);
  return { ...sections, totalAssets, totalLiabilities, totalEquity, asOf };
}

export async function getIncomeStatement(storeId: string, startDate: string, endDate: string) {
  const rows = await getGeneralLedger(storeId, startDate, endDate);
  const revenue = rows.filter(r => r.accountType === 'revenue');
  const expense = rows.filter(r => r.accountType === 'expense');
  const totalRevenue = revenue.reduce((s, r) => s + r.balance, 0);
  const totalExpense = expense.reduce((s, r) => s + r.balance, 0);
  return {
    revenue,
    expense,
    totalRevenue,
    totalExpense,
    netIncome: totalRevenue - totalExpense,
    startDate,
    endDate,
  };
}

export async function getFundBalances(storeId: string, asOf: string) {
  const [accounts, rows] = await Promise.all([
    loadAccountingAccounts(storeId),
    getAccountBalances(storeId, asOf),
  ]);
  const fundCodes = new Set(
    accounts.filter(a => a.isFundAccount || ['101', '102', '103'].includes(String(a.code)))
      .map(a => String(a.code)),
  );
  return rows.filter(r => fundCodes.has(r.accountCode));
}
