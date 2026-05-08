"use client";

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

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

  useEffect(() => {
    // 화면이 렌더링된 후 0.8초(800ms) 뒤에 로그인 페이지로 자동 이동합니다.
    const timer = setTimeout(() => {
      router.push('/login');
    }, 1000);

    // 컴포넌트가 사라질 때 타이머를 정리하여 메모리 누수를 방지합니다. 숫자는 시간 500=0.5초
    return () => clearTimeout(timer);
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
      <h1 className="text-5xl font-extrabold text-teal-400 animate-pulse">
        Pitaya OS
      </h1>
      <p className="mt-4 text-lg text-slate-300">
        첫 페이지입니다.
      </p>
    </div>
  );
}
