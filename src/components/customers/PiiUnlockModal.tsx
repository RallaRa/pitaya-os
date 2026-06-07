'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Fingerprint, Loader2, Smartphone, X, ShieldCheck } from 'lucide-react';
import { startAuthentication, startRegistration } from '@simplewebauthn/browser';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { canUsePlatformAuthenticator, guessDeviceLabel } from '@/lib/piiStepUp/detectBiometric.client';
import { savePiiUnlockToken } from '@/lib/piiStepUp/piiUnlockSession.client';

type Phase = 'choose' | 'webauthn' | 'remote-wait' | 'done' | 'error';

interface PiiUnlockModalProps {
  open: boolean;
  storeId: string;
  uid: string;
  onClose: () => void;
  onUnlocked: (unlockToken: string, expiresAt: number) => void;
}

export default function PiiUnlockModal({
  open,
  storeId,
  uid,
  onClose,
  onUnlocked,
}: PiiUnlockModalProps) {
  const [phase, setPhase] = useState<Phase>('choose');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [hasPlatform, setHasPlatform] = useState<boolean | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const challengeRef = useRef<string | null>(null);
  const autoRemoteStartedRef = useRef(false);

  const cleanupPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (!open) {
      cleanupPoll();
      setPhase('choose');
      setMessage('');
      setLoading(false);
      challengeRef.current = null;
      autoRemoteStartedRef.current = false;
      return;
    }

    canUsePlatformAuthenticator().then(setHasPlatform);
  }, [open, cleanupPoll]);

  useEffect(() => () => cleanupPoll(), [cleanupPoll]);

  const finishUnlock = useCallback((token: string, expiresAt: number) => {
    savePiiUnlockToken({ token, uid, storeId, expiresAt });
    setPhase('done');
    onUnlocked(token, expiresAt);
    setTimeout(onClose, 400);
  }, [onClose, onUnlocked, storeId, uid]);

  const runWebAuthn = useCallback(async () => {
    setLoading(true);
    setPhase('webauthn');
    setMessage('지문·Face ID로 본인 확인 중…');
    try {
      const headers = await getAuthJsonHeaders();
      const authOptRes = await fetch('/api/customers/decrypt/step-up/webauthn', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'auth-options', storeId }),
      });
      const authOptData = await authOptRes.json();
      if (!authOptRes.ok) throw new Error(authOptData.error || '인증 옵션 실패');

      let webauthnResponse;
      if (authOptData.needsRegistration) {
        setMessage('처음 사용 시 지문 등록이 필요합니다…');
        const regOptRes = await fetch('/api/customers/decrypt/step-up/webauthn', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'register-options', storeId }),
        });
        const regOptData = await regOptRes.json();
        if (!regOptRes.ok) throw new Error(regOptData.error || '등록 옵션 실패');
        webauthnResponse = await startRegistration({ optionsJSON: regOptData.options });
        const regVerifyRes = await fetch('/api/customers/decrypt/step-up/webauthn', {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'register-verify', storeId, response: webauthnResponse }),
        });
        const regVerifyData = await regVerifyRes.json();
        if (!regVerifyRes.ok) throw new Error(regVerifyData.error || '등록 검증 실패');
        finishUnlock(regVerifyData.unlockToken, regVerifyData.expiresAt);
        return;
      }

      webauthnResponse = await startAuthentication({ optionsJSON: authOptData.options });
      const verifyRes = await fetch('/api/customers/decrypt/step-up/webauthn', {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'auth-verify', storeId, response: webauthnResponse }),
      });
      const verifyData = await verifyRes.json();
      if (!verifyRes.ok) throw new Error(verifyData.error || '인증 실패');
      finishUnlock(verifyData.unlockToken, verifyData.expiresAt);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : '지문 인증 실패';
      if (hasPlatform === false || /cancel|abort|not allowed/i.test(errMsg)) {
        setMessage('');
        setPhase('choose');
      } else {
        setPhase('error');
        setMessage(errMsg);
      }
    } finally {
      setLoading(false);
    }
  }, [finishUnlock, hasPlatform, storeId]);

  const startRemoteApproval = useCallback(async () => {
    setLoading(true);
    setPhase('remote-wait');
    setMessage('휴대폰 알림·카카오톡으로 승인 링크를 보냈습니다. 지문으로 승인해 주세요.');
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/decrypt/step-up/remote', {
        method: 'POST',
        headers,
        body: JSON.stringify({ storeId, deviceLabel: guessDeviceLabel() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '승인 요청 실패');

      challengeRef.current = data.challengeId;
      cleanupPoll();

      pollRef.current = setInterval(async () => {
        try {
          const pollHeaders = await getAuthHeaders();
          const pollRes = await fetch(
            `/api/customers/decrypt/step-up/remote?challengeId=${encodeURIComponent(data.challengeId)}`,
            { headers: pollHeaders },
          );
          const pollData = await pollRes.json();
          if (pollData.status === 'approved' && pollData.unlockToken) {
            cleanupPoll();
            finishUnlock(pollData.unlockToken, pollData.expiresAt);
          } else if (pollData.status === 'denied') {
            cleanupPoll();
            setPhase('error');
            setMessage('승인이 거절되었습니다.');
            setLoading(false);
          } else if (pollData.status === 'expired') {
            cleanupPoll();
            setPhase('error');
            setMessage('승인 시간이 만료되었습니다. 다시 시도하세요.');
            setLoading(false);
          }
        } catch {
          /* poll retry */
        }
      }, 2000);
    } catch (e: unknown) {
      setPhase('error');
      setMessage(e instanceof Error ? e.message : '승인 요청 실패');
    } finally {
      setLoading(false);
    }
  }, [cleanupPoll, finishUnlock, storeId]);

  useEffect(() => {
    if (!open || hasPlatform !== false || autoRemoteStartedRef.current) return;
    autoRemoteStartedRef.current = true;
    void startRemoteApproval();
  }, [open, hasPlatform, startRemoteApproval]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/70">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl shadow-xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2 text-white font-semibold">
            <ShieldCheck className="w-5 h-5 text-violet-400" />
            개인정보 본인 확인
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <p className="text-sm text-slate-400 leading-relaxed">
            전화번호·이름 복호화 전 본인 확인이 필요합니다.
            {hasPlatform === false && ' 이 PC에는 지문 센서가 없어 휴대폰 승인을 사용합니다.'}
          </p>

          {phase === 'choose' && (
            <div className="space-y-2">
              {hasPlatform !== false && (
                <button
                  type="button"
                  disabled={loading}
                  onClick={runWebAuthn}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-violet-600 hover:bg-violet-500 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Fingerprint className="w-4 h-4" />}
                  지문 · Face ID로 확인
                </button>
              )}
              <button
                type="button"
                disabled={loading}
                onClick={startRemoteApproval}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-slate-200 text-sm font-medium disabled:opacity-50"
              >
                {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Smartphone className="w-4 h-4" />}
                {hasPlatform === false ? '휴대폰 알림으로 승인 (권장)' : 'PC에서 안 될 때 · 휴대폰 승인'}
              </button>
            </div>
          )}

          {(phase === 'webauthn' || phase === 'remote-wait') && (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <Loader2 className="w-8 h-8 text-violet-400 animate-spin" />
              <p className="text-sm text-slate-300">{message}</p>
              {phase === 'remote-wait' && (
                <p className="text-xs text-slate-500">
                  Pitaya 알림 또는 카카오「나에게 보내기」를 확인하세요. (SMS 비용 없음)
                </p>
              )}
            </div>
          )}

          {phase === 'error' && (
            <div className="space-y-3">
              <p className="text-sm text-red-400">{message}</p>
              <button
                type="button"
                onClick={() => { setPhase('choose'); setMessage(''); }}
                className="w-full px-4 py-2 rounded-lg bg-slate-800 text-slate-200 text-sm"
              >
                다시 시도
              </button>
            </div>
          )}

          {phase === 'done' && (
            <p className="text-sm text-teal-400 text-center">본인 확인 완료</p>
          )}
        </div>
      </div>
    </div>
  );
}
