import { adminDb } from '@/lib/firebase/admin';
import type { AccountingAccount, AccountingVoucher, VoucherLine } from '@/lib/accounting/types';

export function sumVoucherLines(lines: VoucherLine[]) {
  let totalDebit = 0;
  let totalCredit = 0;
  for (const l of lines) {
    totalDebit += Number(l.debit || 0);
    totalCredit += Number(l.credit || 0);
  }
  return { totalDebit, totalCredit };
}

export function normalizeVoucherLines(lines: VoucherLine[]): VoucherLine[] {
  return lines.map((line, index) => ({
    lineNo: index + 1,
    accountCode: String(line.accountCode || '').trim(),
    accountName: String(line.accountName || '').trim(),
    partnerCode: String(line.partnerCode || '').trim(),
    partnerName: String(line.partnerName || '').trim(),
    deptCode: String(line.deptCode || '').trim(),
    projectCode: String(line.projectCode || '').trim(),
    debit: Number(line.debit || 0),
    credit: Number(line.credit || 0),
    memo: String(line.memo || '').trim(),
  }));
}

export async function nextVoucherNo(storeId: string, date: string): Promise<string> {
  const prefix = date.replace(/-/g, '');
  const snap = await adminDb.collection('accounting_vouchers')
    .where('storeId', '==', storeId)
    .where('voucherDate', '==', date)
    .get();

  let max = 0;
  for (const d of snap.docs) {
    const no = String(d.data().voucherNo || '');
    const seq = parseInt(no.split('-').pop() || '0', 10);
    if (seq > max) max = seq;
  }
  return `${prefix}-${String(max + 1).padStart(3, '0')}`;
}

export async function loadAccountingAccounts(storeId: string): Promise<AccountingAccount[]> {
  const snap = await adminDb.collection('accounting_accounts')
    .where('storeId', '==', storeId)
    .get();
  return snap.docs
    .map(d => ({ id: d.id, ...d.data() } as AccountingAccount))
    .filter(a => a.isActive !== false)
    .sort((a, b) => String(a.code).localeCompare(String(b.code)));
}

export async function fetchAccountingVouchers(
  storeId: string,
  opts?: {
    status?: string;
    startDate?: string;
    endDate?: string;
    voucherType?: string;
    limit?: number;
  },
): Promise<AccountingVoucher[]> {
  let q = adminDb.collection('accounting_vouchers').where('storeId', '==', storeId);
  if (opts?.status && opts.status !== 'all') {
    q = q.where('status', '==', opts.status) as typeof q;
  }
  if (opts?.voucherType) {
    q = q.where('voucherType', '==', opts.voucherType) as typeof q;
  }

  const snap = await q.limit(opts?.limit || 500).get();
  let vouchers = snap.docs.map(d => ({ id: d.id, ...d.data() } as AccountingVoucher));

  if (opts?.startDate) vouchers = vouchers.filter(v => String(v.voucherDate) >= opts.startDate!);
  if (opts?.endDate) vouchers = vouchers.filter(v => String(v.voucherDate) <= opts.endDate!);

  return vouchers.sort((a, b) => {
    const dateCmp = String(a.voucherDate).localeCompare(String(b.voucherDate));
    if (dateCmp !== 0) return dateCmp;
    return String(a.voucherNo).localeCompare(String(b.voucherNo));
  });
}

export async function getVoucherById(storeId: string, id: string): Promise<AccountingVoucher | null> {
  const snap = await adminDb.collection('accounting_vouchers').doc(id).get();
  if (!snap.exists) return null;
  const data = snap.data()!;
  if (String(data.storeId) !== storeId) return null;
  return { id: snap.id, ...data } as AccountingVoucher;
}

export async function isAccountingPeriodClosed(storeId: string, ymd: string): Promise<boolean> {
  const period = ymd.slice(0, 7);
  const snap = await adminDb.collection('accounting_periods').doc(`${storeId}_${period}`).get();
  return snap.exists && snap.data()?.closed === true;
}
