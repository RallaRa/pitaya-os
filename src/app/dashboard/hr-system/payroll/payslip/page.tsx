'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PayrollSlip } from '@/lib/hr-system/types';

function fmt(n?: number) {
  return (n || 0).toLocaleString('ko-KR');
}

export default function PayslipPage() {
  const { currentStore } = useStore();
  const searchParams = useSearchParams();
  const [period, setPeriod] = useState(() => searchParams.get('period') || new Date().toISOString().slice(0, 7));
  const [empNo, setEmpNo] = useState(() => searchParams.get('empNo') || '');
  const [employees, setEmployees] = useState<{ empNo: string; name: string }[]>([]);
  const [slip, setSlip] = useState<PayrollSlip | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!currentStore?.storeId) return;
    (async () => {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/hr/employees?storeId=${encodeURIComponent(currentStore.storeId)}`,
        { headers },
      );
      const data = await res.json();
      setEmployees((data.employees || []).map((e: { empNo: string; name: string }) => ({
        empNo: e.empNo,
        name: e.name,
      })));
    })();
  }, [currentStore?.storeId]);

  useEffect(() => {
    if (!currentStore?.storeId || !period || !empNo) {
      setSlip(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError('');
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/payroll/slips?storeId=${encodeURIComponent(currentStore.storeId)}&period=${encodeURIComponent(period)}&empNo=${encodeURIComponent(empNo)}`,
          { headers },
        );
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || '조회 실패');
        if (!cancelled) setSlip(data.slip);
      } catch (e: unknown) {
        if (!cancelled) {
          setSlip(null);
          setError(e instanceof Error ? e.message : '오류');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId, period, empNo]);

  return (
    <HrSystemShell>
      <div className="flex flex-wrap gap-3 mb-4">
        <input
          type="month"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
        />
        <select
          value={empNo}
          onChange={e => setEmpNo(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white min-w-[160px]"
        >
          <option value="">사원 선택</option>
          {employees.map(e => (
            <option key={e.empNo} value={e.empNo}>{e.name} ({e.empNo})</option>
          ))}
        </select>
      </div>

      {loading && <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>}
      {error && <p className="text-xs text-red-300">{error}</p>}

      {slip && !loading && (
        <div className="max-w-xl mx-auto rounded-xl border border-slate-700 bg-white text-slate-900 p-6 shadow-xl print:shadow-none">
          <div className="text-center border-b border-slate-200 pb-4 mb-4">
            <h2 className="text-lg font-bold">{slip.period} 급여명세서</h2>
            <p className="text-sm mt-1">{slip.empName} · {slip.department} · {slip.position}</p>
            <p className="text-xs text-slate-500 mt-1">사번 {slip.empNo} · 지급일 {slip.payDay}일</p>
          </div>

          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <p className="font-semibold text-slate-700 mb-2">지급</p>
              {slip.earnings.map(e => (
                <div key={e.code} className="flex justify-between py-0.5">
                  <span>{e.label}</span>
                  <span>{fmt(e.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-slate-200 mt-2 pt-2">
                <span>지급합계</span>
                <span>{fmt(slip.grossPay)}</span>
              </div>
            </div>
            <div>
              <p className="font-semibold text-slate-700 mb-2">공제</p>
              {slip.deductions.map(d => (
                <div key={d.code} className="flex justify-between py-0.5">
                  <span>{d.label}</span>
                  <span>{fmt(d.amount)}</span>
                </div>
              ))}
              <div className="flex justify-between font-bold border-t border-slate-200 mt-2 pt-2">
                <span>공제합계</span>
                <span>{fmt(slip.totalDeductions)}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-3 rounded-lg bg-slate-100 text-center">
            <p className="text-xs text-slate-500">실수령액</p>
            <p className="text-2xl font-bold text-cyan-700">{fmt(slip.netPay)}원</p>
          </div>

          <p className="text-[10px] text-slate-400 mt-4 text-center">
            근무 {slip.actualWorkDays}일 · 연차 {slip.leaveDays}일 · 결근 {slip.absenceDays}일 · 지각 {slip.lateCount}회
          </p>
        </div>
      )}
    </HrSystemShell>
  );
}
