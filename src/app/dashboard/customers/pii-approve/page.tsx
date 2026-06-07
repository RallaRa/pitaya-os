'use client';

import { Suspense, useCallback, useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Fingerprint, Loader2, ShieldCheck, XCircle, CheckCircle2 } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';

function PiiApproveInner() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { user } = useAuth();
  const challengeId = searchParams.get('challenge') || '';

  const [loading, setLoading] = useState(true);
  const [approving, setApproving] = useState(false);
  const [info, setInfo] = useState<{
    storeName?: string;
    deviceLabel?: string;
    status?: string;
    expiresAt?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!user?.uid || !challengeId) {
      setLoading(false);
      return;
    }

    (async () => {
      try {
        const headers = await getAuthJsonHeaders();
        const res = await fetch(
          `/api/customers/decrypt/step-up/remote/approve?challengeId=${encodeURIComponent(challengeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '요청 조회 실패');
        setInfo(data);
        if (data.status === 'approved') setDone(true);
      } catch (e: unknown) {
        setError(e instanceof Error ? e.message : '요청을 불러올 수 없습니다');
      } finally {
        setLoading(false);
      }
    })();
  }, [user?.uid, challengeId]);

  const handleApprove = useCallback(async () => {
    if (!challengeId || approving) return;
    setApproving(true);
    setError(null);
    try {
      const headers = await getAuthJsonHeaders();

      const optRes = await fetch('/api/customers/decrypt/step-up/remote/approve', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ challengeId, mode: 'auth-options' }),
      });
      const optData = await optRes.json();
      if (!optRes.ok) throw new Error(optData.error || '인증 준비 실패');

      let webauthnAction: 'register' | 'authenticate' = 'authenticate';
      let response;

      if (optData.needsRegistration) {
        webauthnAction = 'register';
        response = await startRegistration({ optionsJSON: optData.options });
      } else {
        response = await startAuthentication({ optionsJSON: optData.options });
      }

      const approveRes = await fetch('/api/customers/decrypt/step-up/remote/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ challengeId, action: 'approve', webauthnAction, response }),
      });
      const approveData = await approveRes.json();
      if (!approveRes.ok) throw new Error(approveData.error || '승인 실패');

      setDone(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '지문 승인 실패');
    } finally {
      setApproving(false);
    }
  }, [approving, challengeId]);

  const handleDeny = useCallback(async () => {
    if (!challengeId) return;
    try {
      const headers = await getAuthJsonHeaders();
      await fetch('/api/customers/decrypt/step-up/remote/approve', {
        method: 'POST',
        headers,
        body: JSON.stringify({ challengeId, action: 'deny' }),
      });
      router.push('/dashboard/customers');
    } catch {
      setError('거절 처리 실패');
    }
  }, [challengeId, router]);

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-slate-400 text-sm">
        로그인이 필요합니다.
      </div>
    );
  }

  if (!challengeId) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center text-red-400 text-sm">
        잘못된 승인 링크입니다.
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto mt-8 p-6 bg-slate-900 border border-slate-800 rounded-2xl">
      <div className="flex items-center gap-2 mb-4">
        <ShieldCheck className="w-6 h-6 text-violet-400" />
        <h1 className="text-lg font-bold text-white">고객정보 열람 승인</h1>
      </div>

      {loading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-8 h-8 animate-spin text-teal-400" />
        </div>
      )}

      {!loading && done && (
        <div className="text-center py-6 space-y-2">
          <CheckCircle2 className="w-12 h-12 text-teal-400 mx-auto" />
          <p className="text-white font-medium">승인 완료</p>
          <p className="text-sm text-slate-400">PC에서 개인정보를 열람할 수 있습니다.</p>
        </div>
      )}

      {!loading && !done && info?.status === 'pending' && (
        <div className="space-y-4">
          <div className="bg-slate-800/60 rounded-xl p-4 text-sm text-slate-300 space-y-1">
            <p><span className="text-slate-500">매장</span> {info.storeName || '—'}</p>
            <p><span className="text-slate-500">요청 기기</span> {info.deviceLabel || 'PC'}</p>
          </div>
          <p className="text-xs text-slate-500">
            본인이 요청한 경우에만 지문으로 승인하세요. 승인 후 PC에서 30분간 전화번호가 표시됩니다.
          </p>
          {error && <p className="text-sm text-red-400">{error}</p>}
          <button
            type="button"
            disabled={approving}
            onClick={handleApprove}
            className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white font-semibold disabled:opacity-50"
          >
            {approving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
            지문으로 승인
          </button>
          <button
            type="button"
            onClick={handleDeny}
            className="w-full py-2 text-sm text-slate-500 hover:text-red-400"
          >
            거절
          </button>
        </div>
      )}

      {!loading && !done && info?.status && info.status !== 'pending' && (
        <div className="text-center py-6 space-y-2">
          <XCircle className="w-12 h-12 text-slate-500 mx-auto" />
          <p className="text-slate-300">이미 처리되었거나 만료된 요청입니다 ({info.status})</p>
        </div>
      )}

      {error && !info && (
        <p className="text-sm text-red-400 text-center py-4">{error}</p>
      )}
    </div>
  );
}

export default function PiiApprovePage() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500 text-sm">로딩…</div>}>
      <PiiApproveInner />
    </Suspense>
  );
}
