'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFunnel } from '@/hooks/useFunnel';
import FunnelShell from '@/components/funnel/FunnelShell';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const STEP_LABELS = ['기본정보', '연락처', '등급', '완료'] as const;

export interface CustomerRegistrationData {
  name: string;
  gender: string;
  birthDate: string;
  phone: string;
  email: string;
  address: string;
  grade: string;
  memo: string;
  cusCode?: string;
}

const INITIAL: CustomerRegistrationData = {
  name: '',
  gender: '',
  birthDate: '',
  phone: '',
  email: '',
  address: '',
  grade: '일반',
  memo: '',
};

interface Props {
  storeId: string;
  onClose?: () => void;
  onDone?: (cusCode: string) => void;
}

export default function CustomerRegistrationFunnel({ storeId, onClose, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const funnel = useFunnel<CustomerRegistrationData>({
    syncToUrl: false,
    steps: [
      {
        id: 'basic',
        title: '기본정보',
        validate: ctx => (!ctx.name.trim() ? '고객명을 입력하세요' : null),
      },
      {
        id: 'contact',
        title: '연락처',
        validate: ctx => {
          const digits = ctx.phone.replace(/\D/g, '');
          if (digits.length < 9) return '올바른 휴대폰 번호를 입력하세요';
          return null;
        },
      },
      {
        id: 'grade',
        title: '등급',
        validate: ctx => (!ctx.grade ? '등급을 선택하세요' : null),
      },
      { id: 'done', title: '완료' },
    ],
    initialContext: INITIAL,
  });

  const handleRegister = async () => {
    if (!funnel.currentStep.validate) return;
    const msg = funnel.currentStep.validate?.(funnel.context);
    if (msg) {
      funnel.setError(msg);
      return;
    }
    setSubmitting(true);
    funnel.setError(null);
    try {
      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/customers/register', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          name: funnel.context.name,
          phone: funnel.context.phone,
          grade: funnel.context.grade,
          memo: [funnel.context.memo, funnel.context.email, funnel.context.address].filter(Boolean).join(' | '),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      funnel.patchContext({ cusCode: data.cusCode });
      onDone?.(data.cusCode);
      funnel.goTo(4);
    } catch (e) {
      funnel.setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500';

  const renderStep = () => {
    switch (funnel.step) {
      case 1:
        return (
          <div className="space-y-3 max-w-md">
            <label className="block text-xs text-slate-400">고객명 *</label>
            <input className={fieldClass} value={funnel.context.name} onChange={e => funnel.patchContext({ name: e.target.value })} placeholder="홍길동" />
            <label className="block text-xs text-slate-400">성별</label>
            <select className={fieldClass} value={funnel.context.gender} onChange={e => funnel.patchContext({ gender: e.target.value })}>
              <option value="">선택</option>
              <option value="남">남</option>
              <option value="여">여</option>
            </select>
            <label className="block text-xs text-slate-400">생년월일</label>
            <input type="date" className={fieldClass} value={funnel.context.birthDate} onChange={e => funnel.patchContext({ birthDate: e.target.value })} />
          </div>
        );
      case 2:
        return (
          <div className="space-y-3 max-w-md">
            <label className="block text-xs text-slate-400">휴대폰 *</label>
            <input className={fieldClass} value={funnel.context.phone} onChange={e => funnel.patchContext({ phone: e.target.value })} placeholder="010-0000-0000" />
            <label className="block text-xs text-slate-400">이메일</label>
            <input type="email" className={fieldClass} value={funnel.context.email} onChange={e => funnel.patchContext({ email: e.target.value })} />
            <label className="block text-xs text-slate-400">주소</label>
            <input className={fieldClass} value={funnel.context.address} onChange={e => funnel.patchContext({ address: e.target.value })} />
          </div>
        );
      case 3:
        return (
          <div className="space-y-3 max-w-md">
            <label className="block text-xs text-slate-400">고객 등급 *</label>
            <select className={fieldClass} value={funnel.context.grade} onChange={e => funnel.patchContext({ grade: e.target.value })}>
              {['일반', 'VIP', 'VVIP', '신규'].map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
            <label className="block text-xs text-slate-400">메모</label>
            <textarea className={`${fieldClass} min-h-[80px]`} value={funnel.context.memo} onChange={e => funnel.patchContext({ memo: e.target.value })} />
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-teal-400 mb-3" />
            <p className="text-slate-200 font-semibold">고객 등록이 완료되었습니다</p>
            {funnel.context.cusCode && (
              <p className="text-teal-400 text-sm mt-2">회원코드: {funnel.context.cusCode}</p>
            )}
            {onClose && (
              <button type="button" onClick={onClose} className="mt-6 px-4 py-2 text-xs bg-slate-800 hover:bg-slate-700 rounded-lg">
                닫기
              </button>
            )}
          </div>
        );
    }
  };

  if (funnel.step >= 4) {
    return (
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[420px]">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-teal-400">고객 등록</h2>
        </div>
        <div className="px-5 py-4">{renderStep()}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[480px] flex flex-col">
      <FunnelShell
        title="고객 등록"
        steps={STEP_LABELS.slice(0, 3)}
        currentStep={funnel.step}
        direction={funnel.direction}
        error={funnel.error}
        isFirst={funnel.isFirst}
        isLast={funnel.step === 3}
        submitting={submitting}
        onPrev={funnel.prev}
        onNext={funnel.next}
        onComplete={handleRegister}
        completeLabel="등록하기"
      >
        {renderStep()}
      </FunnelShell>
    </div>
  );
}
