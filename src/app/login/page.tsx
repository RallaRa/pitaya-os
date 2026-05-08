"use client";

/**
 * 파일명: app/login/page.tsx
 * 
 * [기획 의도 및 철학]
 * 1. UI 선행 렌더링: 백엔드 인증 로직 배제 후, 500 에러를 유발하지 않는 순수 프론트엔드 껍데기 선행 구축
 * 2. 테마 통일성: Pitaya OS의 정체성인 다크 모드(bg-slate-950)와 시안(Teal) 포인트 컬러 적용
 * 3. 향후 과제: 본 화면의 'Google 계정으로 로그인' 버튼 클릭 시, Firebase Auth 인증을 거친 후 '/dashboard'로 리다이렉트 되도록 라우팅 추가 예정
 */

import React from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const router = useRouter();

  const handleLoginClick = () => {
    router.push('/dashboard');
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-100">
      <div className="bg-slate-900 p-8 rounded-xl border border-slate-800 shadow-lg w-full max-w-md">
        <h1 className="text-3xl font-bold text-teal-400 text-center mb-6">Pitaya OS</h1>
        <p className="text-center text-slate-400 mb-8">업무의 새로운 기준</p>
        <button 
          onClick={handleLoginClick}
          className="w-full bg-teal-500 hover:bg-teal-400 text-slate-950 font-bold py-3 px-4 rounded-lg transition-transform transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-teal-400 focus:ring-opacity-50"
        >
          Google 계정으로 로그인 (UI 전용)
        </button>
      </div>
    </div>
  );
}