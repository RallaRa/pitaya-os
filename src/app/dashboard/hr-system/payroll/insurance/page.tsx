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

const INS_CODES = ['NP', 'HI', 'LTC', 'EI'];
const INS_ER_CODES = ['NP_ER', 'HI_ER', 'LTC_ER', 'EI_ER', 'IA_ER'];

export default function InsuranceReportPage() {
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

  const sumLines = (slip: PayrollSlip, codes: string[]) =>
    [...slip.deductions, ...slip.employerContributions]
      .filter(l => codes.includes(l.code))
      .reduce((s, l) => s + l.amount, 0);

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
                <th className="px-3 py-2 text-left">성명</th>
                <th className="px-3 py-2 text-right">국민연금</th>
                <th className="px-3 py-2 text-right">건강보험</th>
                <th className="px-3 py-2 text-right">장기요양</th>
                <th className="px-3 py-2 text-right">고용보험</th>
                <th className="px-3 py-2 text-right">근로자합계</th>
                <th className="px-3 py-2 text-right">사업주부담</th>
              </tr>
            </thead>
            <tbody>
              {slips.map(s => {
                const emp = s.deductions.filter(d => INS_CODES.includes(d.code)).reduce((a, d) => a + d.amount, 0);
                const er = s.employerContributions.reduce((a, d) => a + d.amount, 0);
                const get = (code: string) => s.deductions.find(d => d.code === code)?.amount || 0;
                return (
                  <tr key={s.id} className="border-t border-slate-800/80">
                    <td className="px-3 py-2 text-white">{s.empName}</td>
                    <td className="px-3 py-2 text-right">{fmt(get('NP'))}</td>
                    <td className="px-3 py-2 text-right">{fmt(get('HI'))}</td>
                    <td className="px-3 py-2 text-right">{fmt(get('LTC'))}</td>
                    <td className="px-3 py-2 text-right">{fmt(get('EI'))}</td>
                    <td className="px-3 py-2 text-right text-slate-200">{fmt(emp)}</td>
                    <td className="px-3 py-2 text-right text-cyan-300">{fmt(er)}</td>
                  </tr>
                );
              })}
              <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
                <td className="px-3 py-2">합계</td>
                <td className="px-3 py-2 text-right">{fmt(slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'NP')?.amount || 0), 0))}</td>
                <td className="px-3 py-2 text-right">{fmt(slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'HI')?.amount || 0), 0))}</td>
                <td className="px-3 py-2 text-right">{fmt(slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'LTC')?.amount || 0), 0))}</td>
                <td className="px-3 py-2 text-right">{fmt(slips.reduce((s, x) => s + (x.deductions.find(d => d.code === 'EI')?.amount || 0), 0))}</td>
                <td className="px-3 py-2 text-right">{fmt(slips.reduce((s, x) => s + x.deductions.filter(d => INS_CODES.includes(d.code)).reduce((a, d) => a + d.amount, 0), 0))}</td>
                <td className="px-3 py-2 text-right text-cyan-300">{fmt(slips.reduce((s, x) => s + sumLines(x, INS_ER_CODES), 0))}</td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </HrSystemShell>
  );
}
