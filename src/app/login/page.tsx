'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthContext';
import KakaoLoginButton from '@/components/KakaoLoginButton';

export default function LoginPage() {
  const { user, loading, signInWithGoogle, checkAndRoute } = useAuth();
  const [kakaoError, setKakaoError] = useState('');

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const err = params.get('kakao_error');
    if (err) {
      setKakaoError(
        err === 'invalid_state' ? '로그인 세션이 만료되었습니다. 다시 시도해주세요.'
        : err === 'token_failed' ? '카카오 토큰 발급에 실패했습니다. Client Secret과 Redirect URI를 확인해주세요.'
        : `카카오 로그인 실패 (${err})`,
      );
    }
  }, []);

  useEffect(() => {
    if (!loading && user) {
      checkAndRoute(user.uid);
    }
  }, [user, loading, checkAndRoute]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 px-4">
      <div className="text-center mb-10">
        <h1 className="text-4xl md:text-5xl font-extrabold text-slate-100 tracking-tight mb-3">
          <span className="text-teal-400">Pitaya OS</span>
        </h1>
        <p className="text-slate-400 text-base">업무의 새로운 기준</p>
      </div>

      <div className="w-full max-w-sm bg-slate-900 border border-slate-800 rounded-2xl p-8 shadow-xl">
        <p className="text-slate-300 text-sm text-center mb-6">
          Google 또는 카카오 계정으로 로그인하세요.
        </p>

        {kakaoError && (
          <p className="text-red-300 text-xs text-center mb-4 bg-red-900/20 border border-red-800 rounded-lg px-3 py-2">
            {kakaoError}
          </p>
        )}

        <div className="space-y-3">
          <button
            onClick={() => signInWithGoogle()}
            className="w-full flex items-center justify-center gap-3
              bg-white hover:bg-gray-50 active:bg-gray-100
              text-[#3c4043] font-medium text-sm
              border border-gray-300 rounded-lg
              px-4 py-3 transition-colors shadow-md"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            Google로 계속하기
          </button>

          <KakaoLoginButton />
        </div>

        <p className="text-slate-600 text-xs text-center mt-6">
          로그인 시 서비스 이용약관 및 개인정보처리방침에 동의하게 됩니다.
        </p>
      </div>
    </div>
  );
}
