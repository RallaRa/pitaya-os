'use client';

import { Suspense, useEffect } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';

function RedirectInner() {
  const searchParams = useSearchParams();
  const router = useRouter();

  useEffect(() => {
    const challenge = searchParams.get('challenge');
    const qs = challenge ? `?challenge=${encodeURIComponent(challenge)}` : '';
    router.replace(`/pii-approve${qs}`);
  }, [searchParams, router]);

  return (
    <div className="min-h-[40vh] flex items-center justify-center">
      <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
    </div>
  );
}

/** @deprecated /pii-approve 로 이동 */
export default function LegacyPiiApproveRedirect() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">이동 중…</div>}>
      <RedirectInner />
    </Suspense>
  );
}
