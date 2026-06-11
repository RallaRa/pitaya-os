'use client';

import VoucherEntryForm from '@/components/accounting/VoucherEntryForm';

export default function Page() {
  return (
    <VoucherEntryForm
      defaultVoucherType="cash"
      fundMode
      title="입출금전표"
    />
  );
}
