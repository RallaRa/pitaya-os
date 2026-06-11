'use client';

import AccountingShell from '@/components/accounting/AccountingShell';
import AccountingPlaceholder from '@/components/accounting/AccountingPlaceholder';

export default function Page() {
  return (
    <AccountingShell>
      <AccountingPlaceholder feature="계정별잔액현황" />
    </AccountingShell>
  );
}
