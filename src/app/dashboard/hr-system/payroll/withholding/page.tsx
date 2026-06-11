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

export default function WithholdingPage() {
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

  const totalIncome = slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'IT')?.amount || 0), 0);
  const totalLocal = slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'LT')?.amount || 0), 0);

  return (
    <HrSystemShell>
      <div className="mb-4 flex flex-wrap gap-3 items-center">
        <input
          type="month"
          value={period}
          onChange={e => setPeriod(e.target.value)}
          className="rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
        />
        <div className="text-xs text-slate-400">
          소득세 합계 <span className="text-white font-semibold">{fmt(totalIncome)}</span> ·
          지방소득세 <span className="text-cyan-300 font-semibold">{fmt(totalLocal)}</span>
        </div>
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
                <th className="px-3 py-2 text-left">성명</th>
                <th className="px-3 py-2 text-left">부서</th>
                <th className="px-3 py-2 text-right">과세급여(지급)</th>
                <th className="px-3 py-2 text-right">소득세</th>
                <th className="px-3 py-2 text-right">지방소득세</th>
                <th className="px-3 py-2 text-right">세금합계</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(s => {
                const it = s.deductions.find(d => d.code === 'IT')?.amount || 0;
                const lt = s.deductions.find(d => d.code === 'LT')?.amount || 0;
                return (
                  <tr key={s.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-white">{s.empName}</td>
                    <td className="px-3 py-2 text-slate-400">{s.department}</td>
                    <td className="px-3 py-2 text-right">{fmt(s.grossPay)}</td>
                    <td className="px-3 py-2 text-right">{fmt(it)}</td>
                    <td className="px-3 py-2 text-right">{fmt(lt)}</td>
                    <td className="px-3 py-2 text-right text-cyan-300 font-semibold">{fmt(it + lt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </HrSystemShell>
  );
}
