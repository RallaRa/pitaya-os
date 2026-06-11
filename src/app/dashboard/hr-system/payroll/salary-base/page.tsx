'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2, ExternalLink } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface EmployeeRow {
  empNo: string;
  name: string;
  department: string;
  position: string;
  status: string;
  salary?: {
    baseSalary?: number;
    mealAllowance?: number;
    transportAllowance?: number;
    totalMonthly?: number;
    payDay?: number;
    bankName?: string;
  };
}

function fmt(n?: number) {
  return (n || 0).toLocaleString('ko-KR');
}

export default function SalaryBasePage() {
  const { currentStore } = useStore();
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr/employees?storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) setEmployees(data.employees || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId]);

  const active = employees.filter(e => e.status === '재직' || e.status === '수습');
  const totalPay = active.reduce((s, e) => s + (e.salary?.totalMonthly || 0), 0);

  return (
    <HrSystemShell
      actions={(
        <Link
          href="/dashboard/hr/employee-register"
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800"
        >
          <ExternalLink className="w-3.5 h-3.5" />
          사원등록
        </Link>
      )}
    >
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] text-slate-500">재직 인원</p>
              <p className="text-lg font-bold text-white">{active.length}명</p>
            </div>
            <div className="rounded-lg border border-slate-800 bg-slate-900/50 p-3">
              <p className="text-[10px] text-slate-500">월 급여 합계</p>
              <p className="text-lg font-bold text-cyan-300">{fmt(totalPay)}원</p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800">
            <table className="w-full text-xs">
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="px-3 py-2 text-left">사번</th>
                  <th className="px-3 py-2 text-left">성명</th>
                  <th className="px-3 py-2 text-left">부서</th>
                  <th className="px-3 py-2 text-left">직급</th>
                  <th className="px-3 py-2 text-right">기본급</th>
                  <th className="px-3 py-2 text-right">식대</th>
                  <th className="px-3 py-2 text-right">교통비</th>
                  <th className="px-3 py-2 text-right">월합계</th>
                  <th className="px-3 py-2 text-center">지급일</th>
                  <th className="px-3 py-2 text-left">은행</th>
                </tr>
              </thead>
              <tbody>
                {active.map(emp => (
                  <tr key={emp.empNo} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                    <td className="px-3 py-2 text-slate-300">{emp.empNo}</td>
                    <td className="px-3 py-2 text-white font-medium">{emp.name}</td>
                    <td className="px-3 py-2 text-slate-400">{emp.department || '-'}</td>
                    <td className="px-3 py-2 text-slate-400">{emp.position || '-'}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{fmt(emp.salary?.baseSalary)}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{fmt(emp.salary?.mealAllowance)}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{fmt(emp.salary?.transportAllowance)}</td>
                    <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(emp.salary?.totalMonthly)}</td>
                    <td className="px-3 py-2 text-center text-slate-400">{emp.salary?.payDay || 25}일</td>
                    <td className="px-3 py-2 text-slate-400">{emp.salary?.bankName || '-'}</td>
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
