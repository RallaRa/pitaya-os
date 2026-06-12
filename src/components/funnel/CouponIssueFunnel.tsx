'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFunnel } from '@/hooks/useFunnel';
import FunnelShell from '@/components/funnel/FunnelShell';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const STEP_LABELS = ['타입', '조건', '대상', '발송'] as const;

export interface CouponIssueData {
  type: 'percent' | 'fixed';
  title: string;
  code: string;
  value: number;
  minAmount: number;
  maxDiscount: number;
  validDays: number;
  targetType: 'all' | 'grade';
  targetGrade: string;
  sendSms: boolean;
  couponId?: string;
  couponCode?: string;
}

const INITIAL: CouponIssueData = {
  type: 'percent',
  title: '',
  code: '',
  value: 10,
  minAmount: 0,
  maxDiscount: 0,
  validDays: 30,
  targetType: 'all',
  targetGrade: 'VIP',
  sendSms: false,
};

interface Props {
  storeId: string;
  initialContext?: Partial<CouponIssueData>;
  onClose?: () => void;
  onDone?: () => void;
}

function makeCode(title: string) {
  const base = title.replace(/[^a-zA-Z0-9가-힣]/g, '').slice(0, 6).toUpperCase();
  return `${base || 'CPN'}${Date.now().toString().slice(-4)}`;
}

export default function CouponIssueFunnel({ storeId, initialContext, onClose, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const funnel = useFunnel<CouponIssueData>({
    syncToUrl: false,
    steps: [
      {
        id: 'type',
        title: '타입',
        validate: ctx => (!ctx.title.trim() ? '쿠폰명을 입력하세요' : null),
      },
      {
        id: 'condition',
        title: '조건',
        validate: ctx => (ctx.value <= 0 ? '할인값을 입력하세요' : null),
      },
      { id: 'target', title: '대상' },
      { id: 'send', title: '발송' },
    ],
    initialContext: { ...INITIAL, ...initialContext },
  });

  const handleIssue = async () => {
    setSubmitting(true);
    funnel.setError(null);
    try {
      const code = funnel.context.code.trim() || makeCode(funnel.context.title);
      const endDate = new Date();
      endDate.setDate(endDate.getDate() + funnel.context.validDays);

      const headers = await getAuthJsonHeaders();
      const res = await fetch('/api/coupons', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          code,
          type: funnel.context.type,
          value: funnel.context.value,
          minAmount: funnel.context.minAmount,
          maxDiscount: funnel.context.maxDiscount || 0,
          maxUse: funnel.context.targetType === 'all' ? 0 : 100,
          endDate: endDate.toISOString().slice(0, 10),
          title: funnel.context.title,
          description:
            funnel.context.targetType === 'grade'
              ? `${funnel.context.targetGrade} 등급 대상`
              : '전체 고객 대상',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '발행 실패');
      funnel.patchContext({ couponId: data.id, couponCode: data.code || code });
      if (funnel.context.sendSms) {
        // SMS는 알림톡 발송 화면에서 후속 처리
      }
      onDone?.();
      funnel.goTo(4);
    } catch (e) {
      funnel.setError(e instanceof Error ? e.message : '발행 실패');
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
            <label className="block text-xs text-slate-400">쿠폰명 *</label>
            <input className={fieldClass} value={funnel.context.title} onChange={e => funnel.patchContext({ title: e.target.value })} placeholder="VIP 10% 할인" />
            <label className="block text-xs text-slate-400">쿠폰 코드 (비우면 자동 생성)</label>
            <input className={fieldClass} value={funnel.context.code} onChange={e => funnel.patchContext({ code: e.target.value })} placeholder="VIP10" />
            <label className="block text-xs text-slate-400">쿠폰 타입</label>
            <select className={fieldClass} value={funnel.context.type} onChange={e => funnel.patchContext({ type: e.target.value as CouponIssueData['type'] })}>
              <option value="percent">정률 할인 (%)</option>
              <option value="fixed">정액 할인 (원)</option>
            </select>
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <div>
              <label className="block text-xs text-slate-400 mb-1">
                {funnel.context.type === 'percent' ? '할인율 (%)' : '할인금액 (원)'}
              </label>
              <input
                type="number"
                className={fieldClass}
                value={funnel.context.value}
                onChange={e => funnel.patchContext({ value: Number(e.target.value) })}
              />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">최소 주문금액</label>
              <input
                type="number"
                className={fieldClass}
                value={funnel.context.minAmount}
                onChange={e => funnel.patchContext({ minAmount: Number(e.target.value) })}
              />
            </div>
            {funnel.context.type === 'percent' && (
              <div>
                <label className="block text-xs text-slate-400 mb-1">최대 할인금액</label>
                <input
                  type="number"
                  className={fieldClass}
                  value={funnel.context.maxDiscount}
                  onChange={e => funnel.patchContext({ maxDiscount: Number(e.target.value) })}
                />
              </div>
            )}
            <div>
              <label className="block text-xs text-slate-400 mb-1">유효기간 (일)</label>
              <input
                type="number"
                className={fieldClass}
                value={funnel.context.validDays}
                onChange={e => funnel.patchContext({ validDays: Number(e.target.value) })}
              />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="space-y-3 max-w-md">
            <label className="block text-xs text-slate-400">발급 대상</label>
            <select className={fieldClass} value={funnel.context.targetType} onChange={e => funnel.patchContext({ targetType: e.target.value as CouponIssueData['targetType'] })}>
              <option value="all">전체 고객</option>
              <option value="grade">등급별 (설명에 기록)</option>
            </select>
            {funnel.context.targetType === 'grade' && (
              <>
                <label className="block text-xs text-slate-400">등급</label>
                <select className={fieldClass} value={funnel.context.targetGrade} onChange={e => funnel.patchContext({ targetGrade: e.target.value })}>
                  {['VIP', 'VVIP', '일반', '신규'].map(g => (
                    <option key={g} value={g}>{g}</option>
                  ))}
                </select>
              </>
            )}
            <label className="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={funnel.context.sendSms}
                onChange={e => funnel.patchContext({ sendSms: e.target.checked })}
                className="rounded border-slate-600"
              />
              발행 후 알림톡 발송 화면으로 이동
            </label>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-teal-400 mb-3" />
            <p className="text-slate-200 font-semibold">쿠폰 발행이 완료되었습니다</p>
            {funnel.context.couponCode && (
              <p className="text-teal-400 text-sm mt-2">코드: {funnel.context.couponCode}</p>
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
      <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[420px] w-full max-w-lg">
        <div className="px-5 py-4 border-b border-slate-800">
          <h2 className="text-sm font-bold text-teal-400">쿠폰 발행</h2>
        </div>
        <div className="px-5 py-4">{renderStep()}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[480px] w-full max-w-lg flex flex-col">
      <FunnelShell
        title="쿠폰 발행"
        steps={STEP_LABELS}
        currentStep={funnel.step}
        direction={funnel.direction}
        error={funnel.error}
        isFirst={funnel.isFirst}
        isLast={funnel.step === 3}
        submitting={submitting}
        onPrev={funnel.prev}
        onNext={funnel.next}
        onComplete={handleIssue}
        completeLabel="발행하기"
      >
        {renderStep()}
      </FunnelShell>
    </div>
  );
}
