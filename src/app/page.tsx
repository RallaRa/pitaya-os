'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase/firebase';
import Image from 'next/image';

export default function RootPage() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // 이미 이번 세션에 스플래시를 봤으면 인증 상태만 확인 후 바로 이동
    const seen = sessionStorage.getItem('splash_seen');

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        // 로그인 상태 → 대시보드 바로
        router.replace('/dashboard');
        return;
      }
      // 비로그인
      if (seen) {
        router.replace('/login');
        return;
      }
      // 스플래시 표시
      setShowSplash(true);
      sessionStorage.setItem('splash_seen', '1');
    });

    return () => unsubscribe();
  }, [router]);

  // 스플래시가 마운트된 후 페이드인 트리거
  useEffect(() => {
    if (!showSplash) return;
    const t = requestAnimationFrame(() => setVisible(true));
    return () => cancelAnimationFrame(t);
  }, [showSplash]);

  // 3초 후 자동 이동
  useEffect(() => {
    if (!showSplash) return;
    const t = setTimeout(() => router.replace('/login'), 3000);
    return () => clearTimeout(t);
  }, [showSplash, router]);

  const goNow = () => router.replace('/login');

  if (!showSplash) return null;

  return (
    <div
      onClick={goNow}
      className="fixed inset-0 flex flex-col items-center justify-center cursor-pointer select-none"
      style={{ backgroundColor: '#f9fafb' }}
    >
      <div
        style={{
          opacity: visible ? 1 : 0,
          transition: 'opacity 0.5s ease-in',
        }}
        className="flex flex-col items-center gap-6"
      >
        <Image
          src="/images/pitaya-logo.png"
          alt="Pitaya OS"
          width={320}
          height={320}
          priority
          style={{ objectFit: 'contain' }}
        />
      </div>

      <p className="absolute bottom-8 text-gray-300 text-xs">
        다음 페이지로 자동 이동이 되지 않으면 클릭하세요
      </p>
    </div>
  );
}
