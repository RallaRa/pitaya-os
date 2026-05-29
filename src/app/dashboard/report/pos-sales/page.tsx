'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { ArrowLeft, Monitor, Loader2 } from 'lucide-react';

interface PosBreakdown {
  posNo: string;
  totalSale: number;
  netSale: number;
  cashSale?: number;
  cardSale?: number;
  returnCount?: number;
  returnSale?: number;
}

interface ReportRow {
  id: string;
  reportDate: string;
  netSales: number;
  totalSales: number;
  posBreakdown?: PosBreakdown[];
}

export default function PosSalesDetailsPage() {
  const { currentStore } = useStore();
  const [reports, setReports] = useState<ReportRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState('');

  useEffect(() => {
    if (!currentStore?.storeId) { setLoading(false); return; }

    const q = query(
      collection(db, 'daily_reports'),
      where('storeId', '==', currentStore.storeId),
      orderBy('reportDate', 'desc'),
    );

    const unsub = onSnapshot(q, snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() } as ReportRow));
      setReports(rows.slice(0, 30));
      if (!selectedDate && rows[0]) setSelectedDate(rows[0].reportDate);
      setLoading(false);
    }, () => setLoading(false));

    return () => unsub();
  }, [currentStore?.storeId, selectedDate]);

  const selected = reports.find(r => r.reportDate === selectedDate) || reports[0];
  const breakdown = selected?.posBreakdown || [];
  const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

  return (
    <div className="max-w-4xl mx-auto p-6">
      <Link href="/dashboard/report/view" className="flex items-center gap-2 text-slate-400 hover:text-teal-400 text-sm mb-6">
        <ArrowLeft className="w-4 h-4" /> 일마감내역으로
      </Link>

      <div className="flex items-center gap-2 mb-6">
        <Monitor className="w-6 h-6 text-teal-400" />
        <div>
          <h1 className="text-xl font-bold text-teal-400">POS별 매출 내역</h1>
          <p className="text-xs text-slate-500">{currentStore?.storeName}</p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="w-6 h-6 text-teal-400 animate-spin" /></div>
      ) : reports.length === 0 ? (
        <p className="text-slate-500 text-center py-12">POS 연동 데이터가 없습니다. bridge.js 동기화 후 표시됩니다.</p>
      ) : (
        <>
          <div className="flex gap-2 flex-wrap mb-6">
            {reports.map(r => (
              <button
                key={r.id}
                onClick={() => setSelectedDate(r.reportDate)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium ${
                  selected?.reportDate === r.reportDate
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:text-white'
                }`}
              >
                {r.reportDate}
              </button>
            ))}
          </div>

          {selected && (
            <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
              <div className="px-4 py-3 border-b border-slate-800 flex justify-between items-center">
                <span className="text-white font-bold">{selected.reportDate}</span>
                <span className="text-teal-400 text-sm">순매출 {fmt(selected.netSales)}원</span>
              </div>

              {breakdown.length === 0 ? (
                <p className="text-slate-500 text-sm p-6 text-center">
                  POS별 breakdown 없음 — 설정 &gt; POS breakdown 마이그레이션 실행 필요
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-800 text-slate-500 text-xs">
                      <th className="text-left px-4 py-2">POS</th>
                      <th className="text-right px-4 py-2">총매출</th>
                      <th className="text-right px-4 py-2">순매출</th>
                      <th className="text-right px-4 py-2">현금</th>
                      <th className="text-right px-4 py-2">카드</th>
                      <th className="text-right px-4 py-2">반품</th>
                    </tr>
                  </thead>
                  <tbody>
                    {breakdown.map(pos => (
                      <tr key={pos.posNo} className="border-b border-slate-800/60">
                        <td className="px-4 py-3 font-mono text-teal-300">{pos.posNo}</td>
                        <td className="px-4 py-3 text-right text-slate-300">{fmt(pos.totalSale)}</td>
                        <td className="px-4 py-3 text-right text-white font-bold">{fmt(pos.netSale)}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{fmt(pos.cashSale || 0)}</td>
                        <td className="px-4 py-3 text-right text-slate-400">{fmt(pos.cardSale || 0)}</td>
                        <td className="px-4 py-3 text-right text-red-400">{fmt(pos.returnSale || 0)}</td>
                      </tr>
                    ))}
                    <tr className="bg-slate-800/40 font-bold">
                      <td className="px-4 py-3 text-slate-300">합계</td>
                      <td className="px-4 py-3 text-right">{fmt(breakdown.reduce((s, p) => s + (p.totalSale || 0), 0))}</td>
                      <td className="px-4 py-3 text-right text-teal-400">{fmt(breakdown.reduce((s, p) => s + (p.netSale || 0), 0))}</td>
                      <td className="px-4 py-3 text-right">{fmt(breakdown.reduce((s, p) => s + (p.cashSale || 0), 0))}</td>
                      <td className="px-4 py-3 text-right">{fmt(breakdown.reduce((s, p) => s + (p.cardSale || 0), 0))}</td>
                      <td className="px-4 py-3 text-right text-red-400">{fmt(breakdown.reduce((s, p) => s + (p.returnSale || 0), 0))}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
