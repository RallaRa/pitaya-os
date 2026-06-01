'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Bell, ChevronLeft, Loader2, MessageCircle } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import KakaoLinkButton from '@/components/KakaoLinkButton';

const ERROR_MSG: Record<string, string> = {
  denied: '카카오 연동이 취소되었습니다.',
  invalid_state: '연동 세션이 만료되었습니다. 다시 시도해주세요.',
  token_failed: '카카오 토큰 발급에 실패했습니다. Redirect URI와 Client Secret을 확인해주세요.',
  profile_failed: '카카오 프로필을 불러오지 못했습니다.',
  already_linked: '이 카카오 계정은 다른 Pitaya 계정에 이미 연동되어 있습니다.',
  failed: '카카오 연동에 실패했습니다.',
};

function AccountSettingsInner() {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [userData, setUserData] = useState<any>(null);
  const [banner, setBanner] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const loadUser = () => {
    if (!user?.uid) return;
    setLoading(true);
    getAuthHeaders()
      .then(h => fetch(`/api/users?uid=${user.uid}`, { headers: h }))
      .then(r => r.json())
      .then(d => setUserData(d.user || null))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadUser();
  }, [user?.uid]);

  useEffect(() => {
    const linked = searchParams.get('kakao');
    const err = searchParams.get('kakao_error');
    if (linked === 'linked') {
      setBanner({ type: 'success', text: '카카오 알림 연동이 완료되었습니다.' });
      loadUser();
    } else if (err) {
      setBanner({ type: 'error', text: ERROR_MSG[err] || `연동 실패 (${err})` });
    }
  }, [searchParams]);

  return (
    <div className="max-w-2xl mx-auto p-6">
      <Link
        href="/dashboard/settings"
        className="inline-flex items-center gap-1 text-slate-500 hover:text-teal-400 text-sm mb-6 transition-colors"
      >
        <ChevronLeft className="w-4 h-4" />
        설정으로
      </Link>

      <div className="mb-8">
        <h1 className="text-2xl font-bold text-teal-400">내 계정</h1>
        <p className="text-slate-400 text-sm mt-1">
          Google 계정으로 로그인한 뒤 카카오를 연동하면 알림을 카카오톡으로 받을 수 있습니다.
        </p>
      </div>

      {banner && (
        <div className={`mb-4 rounded-xl px-4 py-3 text-sm border ${
          banner.type === 'success'
            ? 'bg-emerald-900/30 border-emerald-500/30 text-emerald-300'
            : 'bg-red-900/30 border-red-500/30 text-red-300'
        }`}>
          {banner.text}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <p className="text-white font-bold mb-1">로그인 계정</p>
            <p className="text-slate-400 text-sm">{user?.email}</p>
            <p className="text-slate-500 text-xs mt-2">
              Pitaya OS는 Google 계정으로만 가입·로그인합니다.
            </p>
          </div>

          <div className="bg-slate-900 border border-slate-700 rounded-xl p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="bg-[#FEE500]/10 p-2.5 rounded-xl">
                <MessageCircle className="w-5 h-5 text-[#FEE500]" />
              </div>
              <div>
                <p className="text-white font-bold">카카오 알림 연동</p>
                <p className="text-slate-400 text-sm mt-0.5">
                  매출 하락, 휴일, 연차 등 알림을 카카오톡으로 받습니다.
                </p>
              </div>
            </div>

            <ul className="text-slate-500 text-xs space-y-1 mb-4 pl-1">
              <li className="flex items-center gap-2"><Bell className="w-3 h-3" /> 나에게 보내기 방식 (친구 추가 불필요)</li>
              <li>· 카카오톡 메시지 수신 동의 필요</li>
            </ul>

            <KakaoLinkButton
              linked={Boolean(userData?.kakaoLinked)}
              kakaoNickname={userData?.kakaoNickname}
              showTestNotify
              onUnlinked={loadUser}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default function AccountSettingsPage() {
  return (
    <Suspense fallback={
      <div className="flex justify-center py-16">
        <Loader2 className="w-6 h-6 text-teal-400 animate-spin" />
      </div>
    }>
      <AccountSettingsInner />
    </Suspense>
  );
}
