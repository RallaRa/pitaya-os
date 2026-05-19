'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';

/**
 * 파일명: app/page.tsx
 * 
 * [기획 의도 및 철학]
 * 1. 프로젝트의 진입점으로, 사용자에게 서비스의 첫인상을 제공
 * 2. Pitaya OS의 아이덴티티를 나타내는 환영 메시지를 중앙에 명확하게 표시
 * 3. 향후 로그인 기능 구현 시, 이 페이지에서 자동으로 로그인 페이지로 이동시키는 로직 추가 예정
 */
export default function RootPage() {
  const router = useRouter();
  const [phase, setPhase] = useState<'melong' | 'error'>('melong');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        router.push('/login');
      }, 1500);
      return () => clearTimeout(timer);
    }
  }, [router]);

  useEffect(() => {
    const t = setTimeout(() => setPhase('error'), 800);
    return () => clearTimeout(t);
  }, []);

  if (phase === 'melong') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-950">
        <p className="text-8xl select-none">😜 메롱</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
      <div className="bg-red-950 border border-red-700 rounded-2xl px-10 py-8 text-center shadow-2xl max-w-md">
        <p className="text-red-400 text-5xl mb-4">⚠️</p>
        <h1 className="text-red-400 text-2xl font-bold mb-2">심각한 오류 발생</h1>
        <p className="text-red-300 text-sm mb-1">CRITICAL: SYSTEM_INTEGRITY_FAILURE</p>
        <p className="text-slate-500 text-xs mb-6">오류 코드: 0x000000EE · 모듈: pitaya_core.dll</p>
        <Link href="/login">
          <button className="bg-red-700 hover:bg-red-600 text-white text-sm px-6 py-2 rounded-lg transition-colors">
            재시도 (로그인으로 이동)
          </button>
        </Link>
      </div>
    </div>
  );
}
