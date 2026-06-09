'use client';

import { useEffect, useState } from 'react';
import { Fingerprint, Loader2, Phone, User } from 'lucide-react';

const AGE_RANGES = ['10대', '20대', '30대', '40대', '50대', '60대', '70대 이상'];

interface Props {
  token: string;
  storeName?: string;
  onVerified: (data: {
    identityId: string;
    phoneMasked: string;
    gender: string;
    ageRange: string;
  }) => void;
}

export default function PublicOrderIdentityGate({ token, storeName, onVerified }: Props) {
  const [phone, setPhone] = useState('');
  const [gender, setGender] = useState<'male' | 'female' | 'unknown'>('unknown');
  const [ageRange, setAgeRange] = useState('');
  const [loading, setLoading] = useState(false);
  const [kakaoLoading, setKakaoLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [kakaoId, setKakaoId] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/public/kakao/callback', { method: 'POST' });
        const data = await res.json();
        if (data.prefill) {
          if (data.prefill.gender && data.prefill.gender !== 'unknown') {
            setGender(data.prefill.gender);
          }
          if (data.prefill.ageRange) setAgeRange(data.prefill.ageRange);
          if (data.prefill.kakaoId) setKakaoId(String(data.prefill.kakaoId));
        }
      } catch { /* ignore */ }
      finally {
        setKakaoLoading(false);
      }
    })();
  }, []);

  const startKakao = () => {
    const returnTo = `/order/${encodeURIComponent(token)}`;
    window.location.href = `/api/public/kakao/auth?returnTo=${encodeURIComponent(returnTo)}`;
  };

  const handleSubmit = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/public/orders/${encodeURIComponent(token)}/identity`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone,
          gender,
          ageRange,
          kakaoId: kakaoId || undefined,
          source: kakaoId ? 'kakao' : 'manual',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '확인 실패');

      localStorage.setItem(`pitaya_po_identity_${token}`, JSON.stringify({
        identityId: data.identityId,
        phoneMasked: data.phoneMasked,
        gender,
        ageRange,
        verifiedAt: Date.now(),
      }));

      onVerified({
        identityId: data.identityId,
        phoneMasked: data.phoneMasked,
        gender,
        ageRange,
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '처리 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-2xl p-6 space-y-5">
        <div className="text-center space-y-1">
          {storeName && (
            <p className="text-[10px] text-teal-400 font-semibold uppercase tracking-wider">{storeName}</p>
          )}
          <h1 className="text-lg font-bold text-white">주문 전 본인 확인</h1>
          <p className="text-xs text-slate-400 leading-relaxed">
            전화번호·성별·연령대를 입력해 주세요.<br />
            Pitaya 회원이면 자동 연결되고, 신규는 매장에서 나중에 등록할 수 있습니다.
          </p>
        </div>

        <button
          type="button"
          onClick={startKakao}
          disabled={kakaoLoading}
          className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-[#FEE500] hover:bg-[#F5DC00] text-gray-900 font-semibold text-sm disabled:opacity-50"
        >
          {kakaoLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
          카카오로 성별·연령대 가져오기
        </button>

        <div className="relative">
          <div className="absolute inset-0 flex items-center">
            <div className="w-full border-t border-slate-700" />
          </div>
          <div className="relative flex justify-center text-[10px] uppercase">
            <span className="bg-slate-900 px-2 text-slate-500">또는 직접 입력</span>
          </div>
        </div>

        <div className="space-y-3">
          <label className="block text-xs text-slate-400">
            <Phone className="w-3.5 h-3.5 inline mr-1" />
            전화번호 (필수)
          </label>
          <input
            type="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="01012345678"
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
          />

          <label className="block text-xs text-slate-400">
            <User className="w-3.5 h-3.5 inline mr-1" />
            성별
          </label>
          <div className="flex gap-2">
            {([
              ['male', '남성'],
              ['female', '여성'],
              ['unknown', '선택안함'],
            ] as const).map(([v, label]) => (
              <button
                key={v}
                type="button"
                onClick={() => setGender(v)}
                className={`flex-1 py-2 rounded-lg text-xs font-medium border ${
                  gender === v
                    ? 'bg-teal-600 border-teal-500 text-white'
                    : 'bg-slate-800 border-slate-700 text-slate-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <label className="block text-xs text-slate-400">연령대</label>
          <select
            value={ageRange}
            onChange={e => setAgeRange(e.target.value)}
            className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-white"
          >
            <option value="">선택</option>
            {AGE_RANGES.map(r => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
        </div>

        {error && <p className="text-xs text-red-400 text-center">{error}</p>}

        <button
          type="button"
          onClick={handleSubmit}
          disabled={loading || !phone.trim()}
          className="w-full flex items-center justify-center gap-2 py-3.5 rounded-xl bg-teal-600 hover:bg-teal-500 disabled:opacity-40 text-white font-bold"
        >
          {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <Fingerprint className="w-5 h-5" />}
          확인하고 주문하기
        </button>

        <p className="text-[10px] text-slate-500 text-center">
          SMS 비용 없음 · 카카오는 성별·연령대만 사용 (전화번호는 직접 입력)
        </p>
      </div>
    </div>
  );
}
