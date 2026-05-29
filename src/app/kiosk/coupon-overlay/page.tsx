'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Tag, CheckCircle2, XCircle, Loader2 } from 'lucide-react';

const STORE_ID = process.env.NEXT_PUBLIC_DEFAULT_STORE_ID || 'STR-1779194754785';

interface ValidateResult {
  valid: boolean;
  message: string;
  discount?: number;
  code?: string;
}

export default function KioskCouponOverlayPage() {
  const [buffer, setBuffer] = useState('');
  const [status, setStatus] = useState<'idle' | 'loading' | 'ok' | 'fail'>('idle');
  const [result, setResult] = useState<ValidateResult | null>(null);
  const [orderAmount, setOrderAmount] = useState('50000');
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const validate = useCallback(async (code: string) => {
    if (!code.trim()) return;
    setStatus('loading');
    setResult(null);
    try {
      const res = await fetch('/api/coupons/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          code: code.trim(),
          storeId: STORE_ID,
          amount: Number(orderAmount) || 0,
        }),
      });
      const data = await res.json();
      setResult(data);
      setStatus(data.valid ? 'ok' : 'fail');

      if (data.valid && typeof window !== 'undefined') {
        window.parent?.postMessage?.({
          type: 'PITAYA_COUPON_OK',
          code: data.code,
          discount: data.discount,
          couponId: data.couponId,
        }, '*');
      }
    } catch {
      setResult({ valid: false, message: '검증 서버 오류' });
      setStatus('fail');
    }

    timerRef.current = setTimeout(() => {
      setStatus('idle');
      setResult(null);
      setBuffer('');
    }, 4000);
  }, [orderAmount]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const code = buffer;
        setBuffer('');
        validate(code);
        return;
      }
      if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setBuffer(prev => prev + e.key);
      }
      if (e.key === 'Backspace') {
        setBuffer(prev => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [buffer, validate]);

  useEffect(() => () => { if (timerRef.current) clearTimeout(timerRef.current); }, []);

  return (
    <div className="min-h-screen bg-black/90 flex flex-col items-center justify-center p-6 text-white select-none">
      <div className="w-full max-w-lg bg-slate-900 border border-slate-700 rounded-2xl p-8 shadow-2xl">
        <div className="flex items-center gap-3 mb-6">
          <Tag className="w-8 h-8 text-teal-400" />
          <div>
            <h1 className="text-xl font-bold">Pitaya 쿠폰 검증</h1>
            <p className="text-slate-400 text-sm">바코드 스캔 또는 키보드 입력 후 Enter</p>
          </div>
        </div>

        <div className="mb-4">
          <label className="text-xs text-slate-500 block mb-1">주문금액 (원)</label>
          <input
            type="number"
            value={orderAmount}
            onChange={e => setOrderAmount(e.target.value)}
            className="w-full bg-slate-800 border border-slate-600 rounded-lg px-3 py-2 text-white"
          />
        </div>

        <div className="bg-slate-800 rounded-xl p-4 min-h-[3rem] font-mono text-lg tracking-widest text-center border border-dashed border-slate-600">
          {buffer || <span className="text-slate-600 text-sm">쿠폰 코드 대기 중...</span>}
        </div>

        <div className="mt-6 flex flex-col items-center gap-3 min-h-[5rem]">
          {status === 'loading' && (
            <>
              <Loader2 className="w-10 h-10 text-teal-400 animate-spin" />
              <p className="text-slate-400">검증 중...</p>
            </>
          )}
          {status === 'ok' && result && (
            <>
              <CheckCircle2 className="w-12 h-12 text-emerald-400" />
              <p className="text-emerald-300 font-bold text-lg">{result.message}</p>
              {result.discount != null && (
                <p className="text-white">할인: {result.discount.toLocaleString()}원</p>
              )}
              <p className="text-xs text-slate-500">포스온으로 전달됨</p>
            </>
          )}
          {status === 'fail' && result && (
            <>
              <XCircle className="w-12 h-12 text-red-400" />
              <p className="text-red-300 font-bold text-lg">{result.message}</p>
              <p className="text-xs text-slate-500">쿠폰 적용 차단</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
