'use client';

import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
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

  useEffect(() => {
    // 이 코드가 브라우저(클라이언트 사이드)에서만 실행되도록 보장합니다.
    if (typeof window !== 'undefined') {
      const timer = setTimeout(() => {
        router.push('/login');
      }, 1500);

      // 컴포넌트가 언마운트될 때 타이머를 정리합니다.
      return () => clearTimeout(timer);
    }
  }, [router]);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-100 font-sans">
      <Link href="/login">
        <h1 className="text-5xl font-extrabold text-teal-400 animate-pulse cursor-pointer">
          Pitaya OS (여기를 클릭하여 수동으로 이동)
        </h1>
      </Link>
      <p className="mt-4 text-lg text-slate-300">
        첫 페이지입니다. 자동 이동이 실패하는 경우 위 텍스트를 클릭해보세요.
      </p>
    </div>
  );
}
