'use client';

import HrSystemShell from '@/components/hr-system/HrSystemShell';
import HrSystemPlaceholder from '@/components/hr-system/HrSystemPlaceholder';

export default function Page() {
  return (
    <HrSystemShell>
      <HrSystemPlaceholder feature="급여조정" />
    </HrSystemShell>
  );
}
