'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { isSuperuserEmail } from '@/lib/auth/permissions';

export default function StockTraderGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const allowed = isSuperuserEmail(user?.email);

  useEffect(() => {
    if (!loading && !allowed) router.replace('/dashboard');
  }, [loading, allowed, router]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-[40vh] text-slate-400">
        <Loader2 className="w-6 h-6 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-8 text-center text-slate-400 text-sm">
        슈퍼유저만 접근할 수 있습니다.
      </div>
    );
  }

  return <>{children}</>;
}
