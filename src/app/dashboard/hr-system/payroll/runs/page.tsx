'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PayrollRun } from '@/lib/hr-system/types';

const STATUS_LABEL: Record<string, string> = {
  draft: '작성중',
  confirmed: '확정',
  cancelled: '취소',
};

function fmt(n?: number) {
  return (n || 0).toLocaleString('ko-KR');
}

export default function PayrollRunsPage() {
  const { currentStore } = useStore();
  const [runs, setRuns] = useState<PayrollRun[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/payroll/runs?storeId=${encodeURIComponent(currentStore.storeId)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) setRuns(data.runs || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId]);

  return (
    <HrSystemShell>
      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : runs.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-16">급여 마감 내역이 없습니다. 급여계산 메뉴에서 먼저 계산하세요.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">급여월</th>
                <th className="px-3 py-2 text-center">상태</th>
                <th className="px-3 py-2 text-right">인원</th>
                <th className="px-3 py-2 text-right">지급총액</th>
                <th className="px-3 py-2 text-right">공제합계</th>
                <th className="px-3 py-2 text-right">실지급액</th>
                <th className="px-3 py-2 text-left">생성일</th>
              </tr>
            </thead>
            <tbody>
              {runs.map(run => (
                <tr key={run.id} className="border-t border-slate-800/80 hover:bg-slate-900/40">
                  <td className="px-3 py-2">
                    <Link href={`/dashboard/hr-system/payroll/runs/${run.period}`} className="text-cyan-300 font-medium hover:underline">
                      {run.period}
                    </Link>
                  </td>
                  <td className="px-3 py-2 text-center">
                    <span className={`px-2 py-0.5 rounded-full text-[10px] ${
                      run.status === 'confirmed' ? 'bg-emerald-900/40 text-emerald-300'
                        : run.status === 'cancelled' ? 'bg-slate-800 text-slate-500'
                          : 'bg-amber-900/40 text-amber-300'
                    }`}>
                      {STATUS_LABEL[run.status] || run.status}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-right text-slate-300">{run.employeeCount}명</td>
                  <td className="px-3 py-2 text-right text-slate-200">{fmt(run.totalGross)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(run.totalDeductions)}</td>
                  <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(run.totalNet)}</td>
                  <td className="px-3 py-2 text-slate-500">{run.createdAt?.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </HrSystemShell>
  );
}
