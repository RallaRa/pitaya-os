'use client';

import { useState } from 'react';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface Props {
  linked?: boolean;
  kakaoNickname?: string;
  onLinked?: () => void;
  onUnlinked?: () => void;
  compact?: boolean;
  showTestNotify?: boolean;
}

export default function KakaoLinkButton({
  linked = false,
  kakaoNickname,
  onLinked,
  onUnlinked,
  compact = false,
  showTestNotify = false,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [testMsg, setTestMsg] = useState('');

  const handleLink = async () => {
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/auth/kakao/link', { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '연동 시작 실패');
      window.location.href = data.url;
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '연동 실패');
      setLoading(false);
    }
  };

  const handleUnlink = async () => {
    if (!confirm('카카오 연동을 해제하면 카카오톡 알림을 받을 수 없습니다. 계속할까요?')) return;
    setLoading(true);
    setError('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/auth/kakao/link', { method: 'DELETE', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '연동 해제 실패');
      onUnlinked?.();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '연동 해제 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleTestNotify = async () => {
    setLoading(true);
    setError('');
    setTestMsg('');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/notify/kakao', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: 'Pitaya OS 테스트 알림',
          message: '카카오 나에게 보내기 연동이 정상 작동합니다.',
          link: '/dashboard/settings/account',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '테스트 알림 발송 실패');
      setTestMsg('카카오톡으로 테스트 알림을 보냈습니다.');
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '테스트 알림 실패');
    } finally {
      setLoading(false);
    }
  };

  if (linked) {
    return (
      <div className={compact ? 'space-y-2' : 'space-y-3'}>
        <div className="flex items-center gap-2 text-xs text-emerald-300">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          카카오 연동됨{kakaoNickname ? ` (${kakaoNickname})` : ''}
        </div>
        {showTestNotify && (
          <button
            type="button"
            onClick={handleTestNotify}
            disabled={loading}
            className="w-full text-xs bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 rounded-lg px-3 py-2 transition-colors disabled:opacity-50"
          >
            {loading ? '발송 중...' : '테스트 알림 보내기'}
          </button>
        )}
        <button
          type="button"
          onClick={handleUnlink}
          disabled={loading}
          className="text-[11px] text-slate-500 hover:text-red-300 transition-colors disabled:opacity-50"
        >
          {loading ? '처리 중...' : '연동 해제'}
        </button>
        {error && <p className="text-red-400 text-[10px]">{error}</p>}
        {testMsg && <p className="text-emerald-400 text-[10px]">{testMsg}</p>}
      </div>
    );
  }

  return (
    <div className={compact ? 'space-y-2' : 'space-y-3'}>
      <button
        type="button"
        onClick={handleLink}
        disabled={loading}
        className="w-full flex items-center justify-center gap-3
          bg-[#FEE500] hover:bg-[#F5DC00] active:bg-[#EACE00]
          text-[#191919] font-medium text-sm
          rounded-lg px-4 py-3 transition-colors shadow-md disabled:opacity-50"
      >
        <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
          <path
            fill="#191919"
            d="M12 3C6.48 3 2 6.58 2 11c0 2.84 1.87 5.35 4.69 6.84-.15.55-.97 3.54-1 3.7 0 .06.02.12.08.15.05.03.11.03.16 0 .07-.03 3.68-2.43 4.24-2.84.58.08 1.17.13 1.83.13 5.52 0 10-3.58 10-8S17.52 3 12 3z"
          />
        </svg>
        {loading ? '연동 준비 중...' : '카카오 알림 연동'}
      </button>
      {error && <p className="text-red-400 text-xs text-center">{error}</p>}
    </div>
  );
}
