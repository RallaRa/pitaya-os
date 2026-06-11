import type { AccountType, AccountingAccount } from '@/lib/accounting/types';
import { ACCOUNT_TYPE_LABELS, ACCOUNT_TYPE_ORDER } from '@/lib/accounting/types';

export interface AccountTreeGroup {
  type: AccountType;
  label: string;
  accounts: AccountingAccount[];
}

export function groupAccountsByType(accounts: AccountingAccount[]): AccountTreeGroup[] {
  const map = new Map<AccountType, AccountingAccount[]>();
  for (const t of ACCOUNT_TYPE_ORDER) map.set(t, []);

  for (const ac of accounts) {
    const list = map.get(ac.type as AccountType) || [];
    list.push(ac);
    map.set(ac.type as AccountType, list);
  }

  return ACCOUNT_TYPE_ORDER.map(type => ({
    type,
    label: ACCOUNT_TYPE_LABELS[type],
    accounts: (map.get(type) || []).sort((a, b) => a.code.localeCompare(b.code)),
  }));
}

export function filterAccounts(
  accounts: AccountingAccount[],
  query: string,
): AccountingAccount[] {
  const q = query.trim().toLowerCase();
  if (!q) return accounts;
  return accounts.filter(ac =>
    ac.code.includes(q)
    || ac.name.toLowerCase().includes(q)
    || (ac.externalCode || '').includes(q),
  );
}

export const EMPTY_ACCOUNT_FORM = {
  code: '',
  externalCode: '',
  name: '',
  type: 'asset' as AccountType,
  parentCode: '',
  allowEntry: true,
  perItemOffset: false,
  usePartner: false,
  isFundAccount: false,
  isActive: true,
  memo: '',
};

export type AccountFormState = typeof EMPTY_ACCOUNT_FORM;

export function accountToForm(ac: AccountingAccount): AccountFormState {
  return {
    code: ac.code,
    externalCode: ac.externalCode || ac.code,
    name: ac.name,
    type: ac.type,
    parentCode: ac.parentCode || '',
    allowEntry: ac.allowEntry !== false,
    perItemOffset: !!ac.perItemOffset,
    usePartner: !!ac.usePartner,
    isFundAccount: !!ac.isFundAccount,
    isActive: ac.isActive !== false,
    memo: ac.memo || '',
  };
}
