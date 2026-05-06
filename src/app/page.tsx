"use client";

/**
 * 파일명: app/page.tsx
 * 
 * [기획 의도 및 철학]
 * 1. 진입점(Gateway) 명확화: 최상단 홈 경로('/')와 로그인 경로('/login')의 시각적/논리적 혼선 방지
 * 2. UX 향상: 접속 시 빈 화면이 아닌 '첫페이지'임을 명확히 인지시키고 1.5초 뒤 자연스럽게 로그인 창으로 유도
 * 3. 자동 리다이렉트: useEffect 훅을 사용하여 화면 렌더링 직후 타이머 기반 클라이언트 라우팅 실행
 * 4. 향후 첫화면에 로고뜬 후 로그인페이지로 넘어가는 까리한 화면으로 교체 예정
 */

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function RootPage() {
  const router = useRouter();

  useEffect(() => {
    // 화면이 렌더링된 후 1.5초(1500ms) 뒤에 로그인 페이지로 자동 이동합니다.
    const timer = setTimeout(() => {
      router.push('/login');
    }, 1200);

    // 컴포넌트가 사라질 때 타이머를 정리하여 메모리 누수를 방지합니다. 숫자는 시간 500=0.5초
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
      <div className="text-center space-y-4">
        <h1 className="text-3xl md:text-4xl font-bold text-teal-400">첫페이지입니다</h1>
        <p className="text-slate-400 animate-pulse">잠시 후 로그인 화면으로 이동합니다...</p>
      </div>
    </div>
  );
}