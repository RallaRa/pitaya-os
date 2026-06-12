'use client';

import { useState, useEffect, useCallback } from 'react';
import { Loader2, Calculator, Send, Info } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders, getAuthJsonHeaders } from '@/lib/getAuthHeaders';

interface Allocation {
  empNo: string;
  empName: string;
  tenureYears: number;
  baseSalary: number;
  profitShareBonus: number;
  employeeRate: number;
}

interface ProfitShareData {
  period: string;
  netSales: number;
  operatingProfit: number;
  distributableProfit: number;
  symbolicEquity: number;
  shareRates: { employee: number; owner: number; tenureYears: number };
  ownerShare: number;
  totalEmployeeBonus: number;
  allocations: Allocation[];
}

export default function ProfitSharePayrollPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<ProfitShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const res = await fetch(
        `/api/hr-system/payroll/profit-share?storeId=${encodeURIComponent(storeId)}&period=${encodeURIComponent(period)}&preview=1`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setData(d.preview || d.run || null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, period]);

  useEffect(() => { load(); }, [load]);

  const run = async () => {
    if (!storeId) return;
    setRunning(true);
    setMessage('');
    setError('');
    try {
      const res = await fetch('/api/hr-system/payroll/profit-share', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ storeId, period }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '실행 실패');
      setData(d.result);
      setMessage(`급여·이익분배 반영 완료 (명세 ${d.slipUpdates}건${d.payrollCreated ? ', 기본급여 신규 계산' : ''})`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '실행 실패');
    } finally {
      setRunning(false);
    }
  };

  return (
    <HrSystemShell
      title="영업이익 분배 급여"
      actions={(
        <button
          type="button"
          onClick={run}
          disabled={running || !storeId}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-medium disabled:opacity-50"
        >
          {running ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
          생성·메신저 발송
        </button>
      )}
    >
      <div className="max-w-3xl space-y-4">
        <div className="rounded-xl border border-slate-800 bg-slate-900/40 p-4">
          <label className="block text-xs text-slate-400 mb-2">급여 년월</label>
          <input
            type="month"
            value={period}
            onChange={e => setPeriod(e.target.value)}
            className="w-full max-w-xs rounded-lg bg-slate-950 border border-slate-700 px-3 py-2 text-sm text-white"
          />
          <p className="text-[11px] text-slate-500 mt-3 leading-relaxed flex items-start gap-1.5">
            <Info className="w-3.5 h-3.5 shrink-0 mt-0.5" />
            영업이익 = 월 매출 − 임대료 − 관리비 − 운영비 − 기본급 합계.
            근속 1·2·3년차별 직원 70/50/30% · 사장 30/50/70% 분배 (상징 지분 1% 제외).
            매월 25일 cron 자동 실행 · PDF는 미지원(메신저·명세서 조회).
          </p>
        </div>

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 animate-spin text-cyan-400" /></div>
        ) : error ? (
          <p className="text-xs text-red-300 bg-red-950/40 border border-red-800/40 rounded-lg px-3 py-2">{error}</p>
        ) : data ? (
          <>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: '월 매출', value: `${data.netSales.toLocaleString()}원` },
                { label: '영업이익', value: `${data.operatingProfit.toLocaleString()}원` },
                { label: '직원 분배', value: `${data.totalEmployeeBonus.toLocaleString()}원` },
                { label: '사장 분배', value: `${data.ownerShare.toLocaleString()}원` },
              ].map(row => (
                <div key={row.label} className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                  <p className="text-[10px] text-slate-500">{row.label}</p>
                  <p className="text-sm font-medium tabular-nums mt-1">{row.value}</p>
                </div>
              ))}
            </div>

            <p className="text-[11px] text-slate-500">
              분배 기준: {data.shareRates.tenureYears}년차 · 직원 {Math.round(data.shareRates.employee * 100)}% / 사장 {Math.round(data.shareRates.owner * 100)}%
              · 상징 지분 {data.symbolicEquity.toLocaleString()}원
            </p>

            <div className="rounded-xl border border-slate-800 overflow-hidden">
              <table className="w-full text-xs">
                <thead className="bg-slate-900/80 text-slate-400">
                  <tr>
                    <th className="text-left px-3 py-2">사번</th>
                    <th className="text-left px-3 py-2">성명</th>
                    <th className="text-right px-3 py-2">근속</th>
                    <th className="text-right px-3 py-2">기본급</th>
                    <th className="text-right px-3 py-2">이익분배</th>
                    <th className="text-right px-3 py-2">합계</th>
                  </tr>
                </thead>
                <tbody>
                  {data.allocations.map(a => (
                    <tr key={a.empNo} className="border-t border-slate-800/80">
                      <td className="px-3 py-2 text-slate-500">{a.empNo}</td>
                      <td className="px-3 py-2">{a.empName}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.tenureYears}년</td>
                      <td className="px-3 py-2 text-right tabular-nums">{a.baseSalary.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums text-cyan-300">{a.profitShareBonus.toLocaleString()}</td>
                      <td className="px-3 py-2 text-right tabular-nums font-medium">{(a.baseSalary + a.profitShareBonus).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}

        {message && (
          <p className="text-xs text-cyan-300 bg-cyan-950/40 border border-cyan-800/40 rounded-lg px-3 py-2 flex items-center gap-1.5">
            <Calculator className="w-3.5 h-3.5" /> {message}
          </p>
        )}
      </div>
    </HrSystemShell>
  );
}
