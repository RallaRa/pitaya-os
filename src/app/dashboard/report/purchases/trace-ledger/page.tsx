'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Search, RefreshCw, Printer, Download, AlertCircle } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

interface TraceRecord {
  id: string; date: string; category: string; name: string;
  weight: number; origin: string; cut: string; grade?: string;
  slaughterHouse?: string; traceNo?: string;
  supplierName?: string; purchaseId?: string;
}

const REQUIRED_FIELDS: (keyof TraceRecord)[] = ['date', 'category', 'name', 'weight', 'origin', 'cut', 'traceNo', 'supplierName'];

function missingFields(r: TraceRecord): string[] {
  return REQUIRED_FIELDS.filter(f => !r[f]);
}

export default function TraceLedgerPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';
  const printRef = useRef<HTMLDivElement>(null);

  const [start,   setStart]   = useState(firstOfMonth);
  const [end,     setEnd]     = useState(today);
  const [records, setRecords] = useState<TraceRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const q = query(
        collection(db, 'trace_records'),
        where('storeId', '==', storeId),
        where('date', '>=', start),
        where('date', '<=', end),
        orderBy('date', 'asc'),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
        return;
      }

      /* trace_records 없으면 purchase_records에서 추출 */
      const h = await getAuthHeaders();
      const p = new URLSearchParams({ storeId, startDate: start, endDate: end });
      const d = await fetch(`/api/purchases?${p}`, { headers: h }).then(r => r.json());
      const recs: any[] = d.records || [];
      const extracted: TraceRecord[] = [];
      recs.forEach(r => {
        (r.items || []).forEach((it: any, idx: number) => {
          extracted.push({
            id: `${r.id}_${idx}`,
            date: r.purchaseDate || '',
            category: it.category || '',
            name: it.name || '',
            weight: it.weight || it.qty || 0,
            origin: it.origin || '',
            cut: it.cut || it.name || '',
            grade: it.grade || '',
            slaughterHouse: it.slaughterHouse || '',
            traceNo: it.traceNo || '',
            supplierName: r.supplierName || '',
            purchaseId: r.id,
          });
        });
      });
      setRecords(extracted);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [storeId, start, end]);

  useEffect(() => { load(); }, [load]);

  const handlePrint = () => { window.print(); };

  const handleExportCSV = () => {
    const headers = ['거래연월일', '식육종류', '물량(kg)', '원산지', '부위명칭', '등급', '도축장명', '이력번호', '매입거래처'];
    const rows = records.map(r => [r.date, r.category, r.weight, r.origin, r.cut, r.grade || '', r.slaughterHouse || '', r.traceNo || '', r.supplierName || '']);
    const csv = [headers, ...rows].map(row => row.map(v => `"${v}"`).join(',')).join('\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `축산물거래내역서_${start}_${end}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const warningCount = records.filter(r => missingFields(r).length > 0).length;

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-bold text-slate-100">축산물 거래내역서</h1>
            <p className="text-slate-500 text-sm mt-0.5">축산물이력법 법정 기록 서식</p>
          </div>
          <div className="flex gap-2">
            <button onClick={handlePrint} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors print:hidden">
              <Printer className="w-4 h-4" />인쇄
            </button>
            <button onClick={handleExportCSV} className="flex items-center gap-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 px-3 py-2 rounded-lg text-sm transition-colors print:hidden">
              <Download className="w-4 h-4" />Excel/CSV
            </button>
          </div>
        </div>

        {warningCount > 0 && (
          <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 text-amber-400 text-sm print:hidden">
            <AlertCircle className="w-4 h-4 shrink-0" />
            법정 필수항목 누락 {warningCount}건 — AI 패널에서 확인하세요
          </div>
        )}

        <div className="flex flex-wrap gap-3 items-end print:hidden">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">시작일</label>
            <input type="date" value={start} onChange={e => setStart(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">종료일</label>
            <input type="date" value={end} onChange={e => setEnd(e.target.value)}
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
          </button>
        </div>

        {/* 법정서식 테이블 */}
        <div ref={printRef} className="bg-white rounded-xl overflow-hidden print:rounded-none print:shadow-none">
          {/* 인쇄 헤더 */}
          <div className="hidden print:block text-center py-4 border-b border-gray-200">
            <h2 className="text-xl font-bold text-gray-900">축산물 거래내역서</h2>
            <p className="text-sm text-gray-600 mt-1">{currentStore?.storeName} | 조회기간: {start} ~ {end}</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse print:text-[10px]">
              <thead>
                <tr className="bg-slate-800 print:bg-gray-100 text-slate-300 print:text-gray-900">
                  {['거래연월일', '식육·포장육의 종류', '물량(kg)', '원산지', '부위명칭', '등급', '도축장명', '이력번호', '매입거래처'].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left border border-slate-700 print:border-gray-300 whitespace-nowrap font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {loading && (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-500 bg-slate-900 print:bg-white">불러오는 중...</td></tr>
                )}
                {!loading && records.length === 0 && (
                  <tr><td colSpan={9} className="text-center py-8 text-slate-500 bg-slate-900 print:bg-white">조회된 내역이 없습니다</td></tr>
                )}
                {records.map((r, idx) => {
                  const missing = missingFields(r);
                  const hasWarning = missing.length > 0;
                  return (
                    <tr key={r.id} className={`border-b ${hasWarning ? 'bg-amber-500/5 print:bg-yellow-50' : 'bg-slate-900 even:bg-slate-800/40 print:bg-white print:even:bg-gray-50'} print:border-gray-300`}>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-300 print:text-gray-900 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-300 print:text-gray-900">{r.category}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-right text-slate-300 print:text-gray-900 tabular-nums">{r.weight}</td>
                      <td className={`px-3 py-2 border border-slate-700 print:border-gray-300 ${!r.origin ? 'text-amber-400' : 'text-slate-300 print:text-gray-900'}`}>{r.origin || '⚠ 누락'}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-300 print:text-gray-900">{r.cut}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-400 print:text-gray-600">{r.grade || '-'}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-400 print:text-gray-600">{r.slaughterHouse || '-'}</td>
                      <td className={`px-3 py-2 border border-slate-700 print:border-gray-300 font-mono ${!r.traceNo ? 'text-amber-400' : 'text-slate-300 print:text-gray-900'} whitespace-nowrap`}>{r.traceNo || '⚠ 누락'}</td>
                      <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-300 print:text-gray-900 whitespace-nowrap">{r.supplierName}</td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="bg-slate-800 print:bg-gray-100">
                  <td className="px-3 py-2 border border-slate-700 print:border-gray-300 font-semibold text-slate-300 print:text-gray-900" colSpan={2}>합계</td>
                  <td className="px-3 py-2 border border-slate-700 print:border-gray-300 text-right font-semibold text-teal-400 print:text-gray-900 tabular-nums">
                    {records.reduce((s, r) => s + (r.weight || 0), 0).toFixed(2)}
                  </td>
                  <td colSpan={6} className="px-3 py-2 border border-slate-700 print:border-gray-300 text-slate-500 print:text-gray-400 text-[10px]">
                    총 {records.length}건 | {warningCount > 0 ? `누락 ${warningCount}건` : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* 인쇄 하단 서명란 */}
          <div className="hidden print:flex justify-between px-8 py-6 border-t border-gray-200 text-xs text-gray-600">
            <span>작성일: {today}</span>
            <span>업소명: {currentStore?.storeName}</span>
            <span>서명: _________________</span>
          </div>
        </div>
      </div>
      <AIPurchasePanel currentPage="trace-ledger" currentData={{ records, warningCount }} filters={{ start, end }} />

      <style jsx global>{`
        @media print {
          body { background: white !important; }
          .print\\:hidden { display: none !important; }
          @page { margin: 10mm; size: A4 landscape; }
        }
      `}</style>
    </div>
  );
}
