"use client";

// [History: 2026-05-13 - 실제 구글 로그인 로직(AuthContext) 연동]
import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/context/AuthContext';

export default function LoginPage() {
  /*const { user, signInWithGoogle, loading } = useAuth();
  const router = useRouter();
  const { user, loading } = useAuth(); // loading 상태도 같이 가져옴!
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) { // 1. 로딩이 다 끝났는데도, 2. 유저가 없다면 그때 쫓아내!
      router.push('/login');
    }
  }, [user, loading, router]);

  // 로딩 중일 때는 흰 화면이나 스피너를 보여주며 시간을 끕니다.
  if (loading) {
    return <div>로딩 중... (Firebase 확인 중)</div>; 
  }

  // 로그인 성공 시 대시보드로 자동 이동
  useEffect(() => {
    if (user) {
      router.push('/dashboard');
    }
  }, [user, router]);*/

// 1. 필요한 상태와 함수를 모두 가져옵니다 (버튼 클릭을 위해 signInWithGoogle도 다시 살려야 합니다)
const { user, loading, signInWithGoogle } = useAuth(); 
const router = useRouter();

// 2. Hook은 무조건 return문보다 위에 둡니다!
// 로그인 페이지의 임무: "이미 로그인된 사람"이 오면 대시보드로 던져버린다.
useEffect(() => {
  if (!loading && user) { 
    router.push('/dashboard');
  }
}, [user, loading, router]);

// 3. 검사 중일 때 화면 (useEffect 아래에 배치)
if (loading) {
  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center">
      <div className="text-teal-400 font-bold">로딩 중... (Firebase 확인 중)</div>
    </div>
  );
}

// 4. 이 아래부터는 기존 return ( <div className="min-h-screen... ) 로그인 UI 코드가 이어집니다.

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center bg-slate-950 text-teal-400">로딩 중...</div>;
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-100 tracking-tight mb-4">
          <span className="text-teal-400">Pitaya OS</span>
        </h1>
        <p className="text-slate-400 text-lg">업무의 새로운 기준</p>
      </div>

      <div className="w-full max-w-sm">
        <button
          onClick={signInWithGoogle}
          className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-50 shadow-lg shadow-teal-500/20"
        >
          Google 계정으로 로그인
        </button>
      </div>
    </div>
  );
}