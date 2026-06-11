'use client';

import HrSystemShell from '@/components/hr-system/HrSystemShell';
import HrSystemPlaceholder from '@/components/hr-system/HrSystemPlaceholder';

export default function Page() {
  return (
    <HrSystemShell>
      <HrSystemPlaceholder feature="결근·지각 현황" />
    </HrSystemShell>
  );
}
