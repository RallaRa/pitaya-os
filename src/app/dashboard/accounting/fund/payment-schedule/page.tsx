'use client';

import AccountingShell from '@/components/accounting/AccountingShell';
import AccountingPlaceholder from '@/components/accounting/AccountingPlaceholder';

export default function Page() {
  return (
    <AccountingShell>
      <AccountingPlaceholder feature="지급예정현황" />
    </AccountingShell>
  );
}
