'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, CheckCircle, AlertCircle, Hash } from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';
import { isMeatCategory } from '@/lib/purchaseCategories';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs, orderBy } from 'firebase/firestore';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

interface TraceRecord {
  id: string; date: string; category: string; name: string;
  weight: number; origin: string; traceNo?: string;
  supplierName?: string; grade?: string;
}

export default function TraceNumbersPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [start,   setStart]   = useState(firstOfMonth);
  const [end,     setEnd]     = useState(today);
  const [search,  setSearch]  = useState('');
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
        orderBy('date', 'desc'),
      );
      const snap = await getDocs(q);
      if (!snap.empty) {
        setRecords(snap.docs.map(d => ({ id: d.id, ...d.data() as any })));
        return;
      }

      /* Fallback: purchase_records */
      const h = await getAuthHeaders();
      const p = new URLSearchParams({ storeId, startDate: start, endDate: end });
      const d = await fetch(`/api/purchases?${p}`, { headers: h }).then(r => r.json());
      const extracted: TraceRecord[] = [];
      (d.records || []).forEach((r: any) => {
        (r.items || []).forEach((it: any, i: number) => {
          const category = it.category || '';
          if (category && !isMeatCategory(category)) return;
          extracted.push({
            id: `${r.id}_${i}`, date: r.purchaseDate || '',
            category: it.category || '', name: it.name || '',
            weight: it.weight || it.qty || 0, origin: it.origin || '',
            traceNo: it.traceNo || '', supplierName: r.supplierName || '',
            grade: it.grade || '',
          });
        });
      });
      setRecords(extracted.sort((a, b) => b.date.localeCompare(a.date)));
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [storeId, start, end]);

  useEffect(() => { load(); }, [load]);

  const filtered = search
    ? records.filter(r => r.traceNo?.includes(search) || r.name?.includes(search) || r.supplierName?.includes(search))
    : records;

  const withTrace    = filtered.filter(r => r.traceNo && r.traceNo.trim() !== '');
  const withoutTrace = filtered.filter(r => !r.traceNo || r.traceNo.trim() === '');

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">이력번호 관리</h1>
          <p className="text-slate-500 text-sm mt-0.5">축산물 이력번호 조회 및 누락 확인</p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
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
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">검색</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="이력번호 / 품목명 / 거래처"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500 w-52" />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
          </button>
        </div>

        {/* 통계 카드 */}
        <div className="grid grid-cols-3 gap-3">
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1"><Hash className="w-3.5 h-3.5" />전체</div>
            <p className="text-xl font-bold text-slate-100">{filtered.length}건</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-teal-400 mb-1"><CheckCircle className="w-3.5 h-3.5" />이력번호 있음</div>
            <p className="text-xl font-bold text-teal-400">{withTrace.length}건</p>
          </div>
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <div className="flex items-center gap-1.5 text-xs text-amber-400 mb-1"><AlertCircle className="w-3.5 h-3.5" />이력번호 누락</div>
            <p className="text-xl font-bold text-amber-400">{withoutTrace.length}건</p>
          </div>
        </div>

        {withoutTrace.length > 0 && (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-4">
            <p className="text-xs font-semibold text-amber-400 mb-2">⚠ 이력번호 누락 항목 ({withoutTrace.length}건)</p>
            <div className="space-y-1">
              {withoutTrace.slice(0, 5).map(r => (
                <div key={r.id} className="flex items-center gap-3 text-xs text-amber-300/70">
                  <span className="whitespace-nowrap">{r.date}</span>
                  <span className="text-amber-200">{r.name}</span>
                  <span className="text-amber-300/50">{r.supplierName}</span>
                </div>
              ))}
              {withoutTrace.length > 5 && <p className="text-xs text-amber-400/60">...외 {withoutTrace.length - 5}건</p>}
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="px-4 py-3 text-left">날짜</th>
                  <th className="px-4 py-3 text-left">품목명</th>
                  <th className="px-4 py-3 text-left">이력번호</th>
                  <th className="px-4 py-3 text-left">거래처</th>
                  <th className="px-4 py-3 text-right">중량(kg)</th>
                  <th className="px-4 py-3 text-left">상태</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="text-center py-8 text-slate-500">불러오는 중...</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-500">조회된 내역이 없습니다</td></tr>}
                {filtered.map(r => {
                  const hasTrace = !!(r.traceNo && r.traceNo.trim());
                  return (
                    <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{r.date}</td>
                      <td className="px-4 py-3 text-slate-200">{r.name}</td>
                      <td className={`px-4 py-3 font-mono whitespace-nowrap ${hasTrace ? 'text-teal-300' : 'text-amber-400'}`}>
                        {r.traceNo || '누락'}
                      </td>
                      <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{r.supplierName || '-'}</td>
                      <td className="px-4 py-3 text-right text-slate-300 tabular-nums">{r.weight || '-'}</td>
                      <td className="px-4 py-3">
                        {hasTrace
                          ? <span className="flex items-center gap-1 text-teal-400"><CheckCircle className="w-3 h-3" />확인</span>
                          : <span className="flex items-center gap-1 text-amber-400"><AlertCircle className="w-3 h-3" />누락</span>}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <AIPurchasePanel currentPage="trace-numbers" currentData={{ records: filtered, withoutTraceCount: withoutTrace.length }} filters={{ start, end, search }} />
    </div>
  );
}
