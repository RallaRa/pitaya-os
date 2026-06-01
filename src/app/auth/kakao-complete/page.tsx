'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** 구 카카오 로그인 완료 페이지 — 계정 연동 페이지로 리다이렉트 */
export default function KakaoCompleteRedirect() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/dashboard/settings/account');
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen bg-slate-950">
      <p className="text-slate-400 text-sm">이동 중...</p>
    </div>
  );
}
