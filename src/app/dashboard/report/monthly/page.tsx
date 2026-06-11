'use client';

import { useState, useEffect, useCallback } from 'react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { FileText, Printer, Loader2 } from 'lucide-react';

interface Report {
  month: string;
  totalSales: number;
  netSales: number;
  customerCount: number;
  dataDays: number;
  avgDailySales: number;
  avgTicket: number;
}

export default function MonthlyReportPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const defaultMonth = new Date(Date.now() + 9 * 3600_000).toISOString().slice(0, 7);
  const [month, setMonth] = useState(defaultMonth);
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/dashboard/monthly-report?storeId=${encodeURIComponent(storeId)}&month=${encodeURIComponent(month)}`, { headers });
    const data = await res.json();
    setReport(data.report || null);
    setLoading(false);
  }, [storeId, month]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="p-6 max-w-2xl mx-auto print:p-0">
      <div className="flex items-center justify-between mb-6 print:hidden">
        <h1 className="text-xl font-bold text-teal-400 flex items-center gap-2">
          <FileText className="w-5 h-5" /> 월간 경영 리포트
        </h1>
        <div className="flex gap-2">
          <input type="month" value={month} onChange={e => setMonth(e.target.value)} className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-1.5 text-sm text-white" />
          <button onClick={() => window.print()} className="flex items-center gap-1 px-3 py-1.5 bg-slate-800 text-slate-300 rounded-lg text-sm">
            <Printer className="w-4 h-4" /> PDF/인쇄
          </button>
        </div>
      </div>

      <div id="monthly-report-print" className="bg-white text-slate-900 rounded-xl p-8 print:rounded-none print:shadow-none">
        <h2 className="text-lg font-bold mb-1">{currentStore?.storeName || '매장'} · {month}</h2>
        <p className="text-slate-500 text-sm mb-6">Pitaya OS 월간 경영 리포트</p>

        {loading ? (
          <Loader2 className="w-6 h-6 animate-spin text-teal-600" />
        ) : report ? (
          <div className="grid grid-cols-2 gap-4">
            {[
              ['순매출', `${report.netSales.toLocaleString()}원`],
              ['총매출', `${report.totalSales.toLocaleString()}원`],
              ['객수', `${report.customerCount.toLocaleString()}명`],
              ['영업일', `${report.dataDays}일`],
              ['일평균 매출', `${report.avgDailySales.toLocaleString()}원`],
              ['객단가', `${report.avgTicket.toLocaleString()}원`],
            ].map(([label, value]) => (
              <div key={label} className="border border-slate-200 rounded-lg p-4">
                <p className="text-slate-500 text-xs">{label}</p>
                <p className="text-xl font-bold mt-1">{value}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-slate-500">데이터 없음</p>
        )}
      </div>

      <style jsx global>{`
        @media print {
          body * { visibility: hidden; }
          #monthly-report-print, #monthly-report-print * { visibility: visible; }
          #monthly-report-print { position: absolute; left: 0; top: 0; width: 100%; }
        }
      `}</style>
    </div>
  );
}
