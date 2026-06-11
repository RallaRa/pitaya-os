'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { PayrollSlip } from '@/lib/hr-system/types';

function fmt(n?: number) {
  return (n || 0).toLocaleString('ko-KR');
}

export default function PayrollLedgerPage() {
  const { currentStore } = useStore();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [slips, setSlips] = useState<PayrollSlip[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/payroll/slips?storeId=${encodeURIComponent(currentStore.storeId)}&period=${encodeURIComponent(period)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) setSlips(data.slips || []);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId, period]);

  const totals = slips.reduce(
    (acc, s) => ({
      gross: acc.gross + s.grossPay,
      deductions: acc.deductions + s.totalDeductions,
      net: acc.net + s.netPay,
    }),
    { gross: 0, deductions: 0, net: 0 },
  );

  return (
    <HrSystemShell>
      <div className="mb-4">
        <input
          type="month"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
      ) : slips.length === 0 ? (
        <p className="text-sm text-slate-500 text-center py-16">해당 월 급여 데이터가 없습니다.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">사번</th>
                <th className="px-3 py-2 text-left">성명</th>
                <th className="px-3 py-2 text-left">부서</th>
                <th className="px-3 py-2 text-left">직급</th>
                <th className="px-3 py-2 text-right">기본급 등</th>
                <th className="px-3 py-2 text-right">공제</th>
                <th className="px-3 py-2 text-right">실지급</th>
                <th className="px-3 py-2 text-left">은행</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(s => (
                <tr key={s.id} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-slate-400">{s.empNo}</td>
                  <td className="px-3 py-2 text-white">{s.empName}</td>
                  <td className="px-3 py-2">{s.department}</td>
                  <td className="px-3 py-2">{s.position}</td>
                  <td className="px-3 py-2 text-right">{fmt(s.grossPay)}</td>
                  <td className="px-3 py-2 text-right text-slate-400">{fmt(s.totalDeductions)}</td>
                  <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(s.netPay)}</td>
                  <td className="px-3 py-2 text-slate-500">{s.bankName || '-'}</td>
                </tr>
              ))}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
                <td colSpan={4} className="px-3 py-2 text-slate-300">합계 ({slips.length}명)</td>
                <td className="px-3 py-2 text-right">{fmt(totals.gross)}</td>
                <td className="px-3 py-2 text-right">{fmt(totals.deductions)}</td>
                <td className="px-3 py-2 text-right text-cyan-300">{fmt(totals.net)}</td>
                <td />
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </HrSystemShell>
  );
}
