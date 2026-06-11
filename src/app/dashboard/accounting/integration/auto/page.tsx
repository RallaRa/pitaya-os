'use client';

import { Suspense } from 'react';
import { Loader2 } from 'lucide-react';
import AutoVoucherIntegrationPage from '@/components/accounting/AutoVoucherIntegrationPage';

export default function Page() {
  return (
    <Suspense fallback={(
      <div className="flex justify-center py-24">
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      </div>
    )}
    >
      <AutoVoucherIntegrationPage />
    </Suspense>
  );
}
