'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { signInWithCustomToken } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

function KakaoCompleteInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { checkAndRoute } = useAuth();

  useEffect(() => {
    const token = searchParams.get('token');
    if (!token) {
      router.push('/login?error=kakao_failed');
      return;
    }

    signInWithCustomToken(auth, token)
      .then(async (result) => {
        await fetch('/api/users', {
          method: 'POST',
          headers: await getAuthJsonHeaders(),
          body: JSON.stringify({
            uid: result.user.uid,
            name: result.user.displayName,
            email: result.user.email,
            photoURL: result.user.photoURL,
          }),
        });
        await checkAndRoute(result.user.uid);
      })
      .catch(() => router.push('/login?error=kakao_failed'));
  }, [checkAndRoute, router, searchParams]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-2 border-[#FEE500] border-t-transparent rounded-full mx-auto mb-4" />
        <p className="text-white text-sm">카카오 로그인 처리 중...</p>
      </div>
    </div>
  );
}

export default function KakaoComplete() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-slate-950">
        <div className="animate-spin w-8 h-8 border-2 border-[#FEE500] border-t-transparent rounded-full mx-auto" />
      </div>
    }>
      <KakaoCompleteInner />
    </Suspense>
  );
}
