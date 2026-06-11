'use client';

import { useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import { useFunnel } from '@/hooks/useFunnel';
import FunnelShell from '@/components/funnel/FunnelShell';
import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';

const STEP_LABELS = ['기본정보', '급여', '권한', '완료'] as const;

export interface EmployeeRegistrationData {
  name: string;
  phone: string;
  department: string;
  position: string;
  hireDate: string;
  employmentType: string;
  baseSalary: number;
  mealAllowance: number;
  transportAllowance: number;
  payDay: number;
  bankName: string;
  accountNo: string;
  role: string;
  empNo?: string;
}

const INITIAL: EmployeeRegistrationData = {
  name: '',
  phone: '',
  department: '',
  position: '사원',
  hireDate: new Date().toISOString().slice(0, 10),
  employmentType: '정규직',
  baseSalary: 0,
  mealAllowance: 0,
  transportAllowance: 0,
  payDay: 25,
  bankName: '',
  accountNo: '',
  role: 'staff',
};

interface Props {
  storeId: string;
  onClose?: () => void;
  onDone?: () => void;
}

export default function EmployeeRegistrationFunnel({ storeId, onClose, onDone }: Props) {
  const [submitting, setSubmitting] = useState(false);

  const funnel = useFunnel<EmployeeRegistrationData>({
    syncToUrl: false,
    steps: [
      {
        id: 'basic',
        title: '기본정보',
        validate: ctx => {
          if (!ctx.name.trim()) return '성명을 입력하세요';
          if (!ctx.hireDate) return '입사일을 입력하세요';
          return null;
        },
      },
      {
        id: 'salary',
        title: '급여',
        validate: ctx => (ctx.baseSalary <= 0 ? '기본급을 입력하세요' : null),
      },
      { id: 'role', title: '권한' },
      { id: 'done', title: '완료' },
    ],
    initialContext: INITIAL,
  });

  const handleRegister = async () => {
    setSubmitting(true);
    funnel.setError(null);
    try {
      const headers = await getAuthJsonHeaders();
      const totalMonthly =
        funnel.context.baseSalary + funnel.context.mealAllowance + funnel.context.transportAllowance;

      const res = await fetch('/api/hr/employees', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          storeId,
          name: funnel.context.name,
          phone: funnel.context.phone,
          department: funnel.context.department,
          position: funnel.context.position,
          hireDate: funnel.context.hireDate,
          employmentType: funnel.context.employmentType,
          role: funnel.context.role,
          salary: {
            type: 'monthly',
            baseSalary: funnel.context.baseSalary,
            mealAllowance: funnel.context.mealAllowance,
            transportAllowance: funnel.context.transportAllowance,
            totalMonthly,
            payDay: funnel.context.payDay,
            bankName: funnel.context.bankName,
            accountNo: funnel.context.accountNo,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '등록 실패');
      funnel.patchContext({ empNo: data.empNo || data.employee?.empNo });
      onDone?.();
      funnel.goTo(4);
    } catch (e) {
      funnel.setError(e instanceof Error ? e.message : '등록 실패');
    } finally {
      setSubmitting(false);
    }
  };

  const fieldClass =
    'w-full bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-teal-500';

  const numField = (key: keyof EmployeeRegistrationData, label: string) => (
    <div>
      <label className="block text-xs text-slate-400 mb-1">{label}</label>
      <input
        type="number"
        className={fieldClass}
        value={funnel.context[key] as number}
        onChange={e => funnel.patchContext({ [key]: Number(e.target.value) } as Partial<EmployeeRegistrationData>)}
      />
    </div>
  );

  const renderStep = () => {
    switch (funnel.step) {
      case 1:
        return (
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">성명 *</label>
              <input className={fieldClass} value={funnel.context.name} onChange={e => funnel.patchContext({ name: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">부서</label>
              <input className={fieldClass} value={funnel.context.department} onChange={e => funnel.patchContext({ department: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">직급</label>
              <input className={fieldClass} value={funnel.context.position} onChange={e => funnel.patchContext({ position: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">입사일 *</label>
              <input type="date" className={fieldClass} value={funnel.context.hireDate} onChange={e => funnel.patchContext({ hireDate: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">고용형태</label>
              <select className={fieldClass} value={funnel.context.employmentType} onChange={e => funnel.patchContext({ employmentType: e.target.value })}>
                {['정규직', '계약직', '파트타임', '인턴'].map(t => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            </div>
            <div className="col-span-2">
              <label className="block text-xs text-slate-400 mb-1">연락처</label>
              <input className={fieldClass} value={funnel.context.phone} onChange={e => funnel.patchContext({ phone: e.target.value })} />
            </div>
          </div>
        );
      case 2:
        return (
          <div className="grid grid-cols-2 gap-3 max-w-lg">
            {numField('baseSalary', '기본급 (원) *')}
            {numField('mealAllowance', '식대')}
            {numField('transportAllowance', '교통비')}
            {numField('payDay', '급여일 (매월)')}
            <div>
              <label className="block text-xs text-slate-400 mb-1">은행</label>
              <input className={fieldClass} value={funnel.context.bankName} onChange={e => funnel.patchContext({ bankName: e.target.value })} />
            </div>
            <div>
              <label className="block text-xs text-slate-400 mb-1">계좌번호</label>
              <input className={fieldClass} value={funnel.context.accountNo} onChange={e => funnel.patchContext({ accountNo: e.target.value })} />
            </div>
          </div>
        );
      case 3:
        return (
          <div className="max-w-md space-y-3">
            <label className="block text-xs text-slate-400">시스템 권한</label>
            <select className={fieldClass} value={funnel.context.role} onChange={e => funnel.patchContext({ role: e.target.value })}>
              <option value="staff">일반 직원</option>
              <option value="manager">매니저</option>
              <option value="admin">관리자</option>
            </select>
            <p className="text-xs text-slate-500">권한은 입사 후 계정 연결 시 적용됩니다.</p>
          </div>
        );
      default:
        return (
          <div className="flex flex-col items-center justify-center py-10 text-center">
            <CheckCircle2 className="w-12 h-12 text-teal-400 mb-3" />
            <p className="text-slate-200 font-semibold">사원 등록이 완료되었습니다</p>
            {funnel.context.empNo && (
              <p className="text-teal-400 text-sm mt-2">사원번호: {funnel.context.empNo}</p>
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
          <h2 className="text-sm font-bold text-teal-400">사원 등록</h2>
        </div>
        <div className="px-5 py-4">{renderStep()}</div>
      </div>
    );
  }

  return (
    <div className="bg-slate-950 rounded-2xl border border-slate-800 overflow-hidden min-h-[520px] flex flex-col">
      <FunnelShell
        title="사원 등록"
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
