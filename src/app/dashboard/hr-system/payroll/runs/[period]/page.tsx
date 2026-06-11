'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle, XCircle } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PayrollRun, PayrollSlip } from '@/lib/hr-system/types';

function fmt(n?: number) {
  return (n || 0).toLocaleString('ko-KR');
}

export default function PayrollRunDetailPage() {
  const params = useParams();
  const period = String(params.period || '');
  const { currentStore } = useStore();
  const [run, setRun] = useState<PayrollRun | null>(null);
  const [slips, setSlips] = useState<PayrollSlip[]>([]);
  const [loading, setLoading] = useState(true);
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState('');

  const load = async () => {
    if (!currentStore?.storeId || !period) return;
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/hr-system/payroll/runs?storeId=${encodeURIComponent(currentStore.storeId)}&period=${encodeURIComponent(period)}`,
        { headers },
      );
      const data = await res.json();
      setRun(data.run);
      setSlips(data.slips || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStore?.storeId, period]);

  const handleAction = async (action: 'confirm' | 'cancel') => {
    if (!currentStore?.storeId) return;
    setActing(true);
    setMessage('');
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/hr-system/payroll/runs', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ storeId: currentStore.storeId, period, action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '처리 실패');
      setMessage(data.message);
      await load();
    } catch (e: unknown) {
      setMessage(e instanceof Error ? e.message : '오류');
    } finally {
      setActing(false);
    }
  };

  return (
    <HrSystemShell
      title={`${period} 급여마감`}
      actions={run?.status === 'draft' ? (
        <div className="flex gap-2">
          <button
            type="button"
            disabled={acting}
            onClick={() => handleAction('confirm')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs disabled:opacity-50"
          >
            <CheckCircle className="w-3.5 h-3.5" /> 확정
          </button>
          <button
            type="button"
            disabled={acting}
            onClick={() => handleAction('cancel')}
            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-600 text-xs text-slate-300 hover:bg-slate-800 disabled:opacity-50"
          >
            <XCircle className="w-3.5 h-3.5" /> 취소
          </button>
        </div>
      ) : undefined}
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : !run ? (
        <p className="text-sm text-slate-500 text-center py-16">데이터 없음</p>
      ) : (
        <>
          {message && <p className="text-xs text-cyan-300 mb-3">{message}</p>}

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">인원</p>
              <p className="text-lg font-bold text-white">{run.employeeCount}명</p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">지급총액</p>
              <p className="text-lg font-bold text-white">{fmt(run.totalGross)}</p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">실지급액</p>
              <p className="text-lg font-bold text-cyan-300">{fmt(run.totalNet)}</p>
            </div>
            <div className="rounded-lg border border-slate-800 p-3">
              <p className="text-[10px] text-slate-500">회사부담(4대보험)</p>
              <p className="text-lg font-bold text-slate-300">{fmt(run.totalEmployerCost)}</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">사번</th>
                  <th className="px-3 py-2 text-left">성명</th>
                  <th className="px-3 py-2 text-left">부서</th>
                  <th className="px-3 py-2 text-right">지급</th>
                  <th className="px-3 py-2 text-right">공제</th>
                  <th className="px-3 py-2 text-right">실수령</th>
                  <th className="px-3 py-2 text-center">근태</th>
                  <th className="px-3 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {slips.map(slip => (
                  <tr key={slip.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-slate-400">{slip.empNo}</td>
                    <td className="px-3 py-2 text-white">{slip.empName}</td>
                    <td className="px-3 py-2 text-slate-400">{slip.department}</td>
                    <td className="px-3 py-2 text-right">{fmt(slip.grossPay)}</td>
                    <td className="px-3 py-2 text-right text-slate-400">{fmt(slip.totalDeductions)}</td>
                    <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(slip.netPay)}</td>
                    <td className="px-3 py-2 text-center text-slate-500">
                      출{slip.actualWorkDays}/휴{slip.leaveDays}/결{slip.absenceDays}
                    </td>
                    <td className="px-3 py-2">
                      <Link
                        href={`/dashboard/hr-system/payroll/payslip?period=${period}&empNo=${slip.empNo}`}
                        className="text-cyan-400 hover:underline"
                      >
                        명세
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </HrSystemShell>
  );
}
