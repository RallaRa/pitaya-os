'use client';

import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import HrSystemShell from '@/components/hr-system/HrSystemShell';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface AttendanceRow {
  empNo: string;
  empName: string;
  department: string;
  position: string;
  workDays: number;
  actualWorkDays: number;
  leaveDays: number;
  absenceDays: number;
  lateCount: number;
}

export default function MonthlySummaryPage() {
  const { currentStore } = useStore();
  const [period, setPeriod] = useState(() => new Date().toISOString().slice(0, 7));
  const [rows, setRows] = useState<AttendanceRow[]>([]);
  const [totals, setTotals] = useState({ actualWorkDays: 0, leaveDays: 0, absenceDays: 0, lateCount: 0 });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!currentStore?.storeId) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(
          `/api/hr-system/attendance/summary?storeId=${encodeURIComponent(currentStore.storeId)}&period=${encodeURIComponent(period)}`,
          { headers },
        );
        const data = await res.json();
        if (!cancelled) {
          setRows(data.rows || []);
          setTotals(data.totals || { actualWorkDays: 0, leaveDays: 0, absenceDays: 0, lateCount: 0 });
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [currentStore?.storeId, period]);

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
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-800">
          <table className="w-full text-xs">
            <thead className="bg-slate-900/80 text-slate-400">
              <tr>
                <th className="px-3 py-2 text-left">사번</th>
                <th className="px-3 py-2 text-left">성명</th>
                <th className="px-3 py-2 text-left">부서</th>
                <th className="px-3 py-2 text-center">근무일</th>
                <th className="px-3 py-2 text-center">출근</th>
                <th className="px-3 py-2 text-center">연차</th>
                <th className="px-3 py-2 text-center">결근</th>
                <th className="px-3 py-2 text-center">지각</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.empNo} className="border-t border-slate-800/80">
                  <td className="px-3 py-2 text-slate-400">{r.empNo}</td>
                  <td className="px-3 py-2 text-white">{r.empName}</td>
                  <td className="px-3 py-2">{r.department}</td>
                  <td className="px-3 py-2 text-center">{r.workDays}</td>
                  <td className="px-3 py-2 text-center text-emerald-300">{r.actualWorkDays}</td>
                  <td className="px-3 py-2 text-center text-blue-300">{r.leaveDays}</td>
                  <td className="px-3 py-2 text-center text-red-300">{r.absenceDays}</td>
                  <td className="px-3 py-2 text-center text-amber-300">{r.lateCount}</td>
                </tr>
              ))}
              {rows.length > 0 && (
                <tr className="border-t-2 border-slate-700 bg-slate-900/60 font-semibold">
                  <td colSpan={4} className="px-3 py-2">합계</td>
                  <td className="px-3 py-2 text-center">{totals.actualWorkDays}</td>
                  <td className="px-3 py-2 text-center">{totals.leaveDays}</td>
                  <td className="px-3 py-2 text-center">{totals.absenceDays}</td>
                  <td className="px-3 py-2 text-center">{totals.lateCount}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </HrSystemShell>
  );
}
