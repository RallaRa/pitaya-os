'use client';

import { use } from 'react';
import VoucherEntryForm from '@/components/accounting/VoucherEntryForm';

export default function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <VoucherEntryForm voucherId={id} />;
}
