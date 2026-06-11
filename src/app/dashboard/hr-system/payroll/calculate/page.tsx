'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2, Calculator } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

export default function PayrollCalculatePage() {
  const { currentStore } = useStore();
  const router = useRouter();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const handleCalculate = async () => {
    if (!currentStore?.storeId) return;
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/hr-system/payroll/runs', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId, period }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '계산 실패');
      setMessage(data.message || '계산 완료');
      router.push(`/dashboard/hr-system/payroll/runs/${period}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '오류');
    } finally {
      setRunning(false);
    }
  };

  return (
    <HrSystemShell
      actions={(
        <button
          type="button"
          onClick={handleCalculate}
          disabled={running}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Calculator className="w-3.5 h-3.5" />}
          급여 계산
        </button>
      )}
    >
      <div className="max-w-lg space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-400 mb-2">급여 년월</label>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="w-full rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
          />
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed">
            사원 기본급·수당과 해당 월 출퇴근·승인 연차를 반영하여 급여를 산출합니다.
            4대보험·원천징수는 급여환경설정 요율을 적용합니다.
          </p>
        </div>

        {message && (
          <p className="text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2">{message}</p>
        )}
        {error && (
          <p className="text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
        )}
      </div>
    </HrSystemShell>
  );
}
