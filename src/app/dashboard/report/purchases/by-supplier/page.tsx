'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, ChevronDown, ChevronUp, AlertCircle } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

interface Rec {
  id: string; purchaseDate: string; supplierName: string;
  items?: { name: string; supplyAmount?: number }[];
  totalAmount: number; paymentMethod?: string;
  supplyAmount?: number; taxAmount?: number;
}

interface SupplierStat {
  name: string;
  total: number;
  count: number;
  credit: number;
  records: Rec[];
  itemMap: Map<string, number>;
  monthlyMap: Map<string, number>;
}

export default function BySupplierPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = new Date().toISOString().split('T')[0];
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [start,    setStart]   = useState(threeMonthsAgo);
  const [end,      setEnd]     = useState(today);
  const [records,  setRecords] = useState<Rec[]>([]);
  const [loading,  setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      const h = await getAuthHeaders();
      const p = new URLSearchParams({ storeId, startDate: start, endDate: end });
      const d = await fetch(`/api/purchases?${p}`, { headers: h }).then(r => r.json());
      setRecords(d.records || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [storeId, start, end]);

  useEffect(() => { load(); }, [load]);

  /* 거래처별 집계 */
  const supplierMap = new Map<string, SupplierStat>();
  records.forEach(r => {
    const name = r.supplierName || '기타';
    if (!supplierMap.has(name)) {
      supplierMap.set(name, { name, total: 0, count: 0, credit: 0, records: [], itemMap: new Map(), monthlyMap: new Map() });
    }
    const stat = supplierMap.get(name)!;
    stat.total += r.totalAmount || 0;
    stat.count += 1;
    if (r.paymentMethod === '외상') stat.credit += r.totalAmount || 0;
    stat.records.push(r);
    r.items?.forEach(it => {
      stat.itemMap.set(it.name, (stat.itemMap.get(it.name) || 0) + (it.supplyAmount || 0));
    });
    const m = r.purchaseDate?.slice(0, 7);
    if (m) stat.monthlyMap.set(m, (stat.monthlyMap.get(m) || 0) + (r.totalAmount || 0));
  });
  const suppliers = [...supplierMap.values()].sort((a, b) => b.total - a.total);

  const panelData = { suppliers: suppliers.map(s => ({ name: s.name, total: s.total, credit: s.credit })) };

  return (
    <div className="flex h-full min-h-0 bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">거래처별 매입</h1>
          <p className="text-slate-500 text-sm mt-0.5">거래처별 매입 현황 및 분석</p>
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
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
          </button>
        </div>

        {loading && <div className="text-center py-12 text-slate-500">불러오는 중...</div>}
        {!loading && suppliers.length === 0 && <div className="text-center py-12 text-slate-500">조회된 거래처가 없습니다</div>}

        <div className="space-y-3">
          {suppliers.map(stat => {
            const isOpen = expanded === stat.name;
            const monthlyData = [...stat.monthlyMap.entries()]
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([month, amount]) => ({ month: month.slice(5), amount }));
            const topItems = [...stat.itemMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 5);

            return (
              <div key={stat.name} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
                <button
                  onClick={() => setExpanded(isOpen ? null : stat.name)}
                  className="w-full flex items-center gap-4 px-4 py-4 hover:bg-slate-800/40 transition-colors"
                >
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2">
                      <p className="font-semibold text-slate-200">{stat.name}</p>
                      {stat.credit > 0 && (
                        <span className="flex items-center gap-0.5 text-[10px] text-amber-400 bg-amber-500/10 px-1.5 py-0.5 rounded-full border border-amber-500/20">
                          <AlertCircle className="w-2.5 h-2.5" />외상 {stat.credit.toLocaleString()}원
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">총 {stat.count}건</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-teal-400 tabular-nums">{stat.total.toLocaleString()}원</p>
                    <p className="text-xs text-slate-500">총 매입액</p>
                  </div>
                  {isOpen ? <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" /> : <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />}
                </button>

                {isOpen && (
                  <div className="border-t border-slate-800 p-4 space-y-4">
                    <div className="grid md:grid-cols-2 gap-4">
                      {/* 단가 추이 */}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">월별 매입 추이</p>
                        {monthlyData.length > 1 ? (
                          <ResponsiveContainer width="100%" height={120}>
                            <LineChart data={monthlyData}>
                              <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 10 }} />
                              <YAxis tick={{ fill: '#64748b', fontSize: 9 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                              <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`, '매입액']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                              <Line type="monotone" dataKey="amount" stroke="#14b8a6" strokeWidth={2} dot={false} />
                            </LineChart>
                          </ResponsiveContainer>
                        ) : (
                          <p className="text-xs text-slate-600 py-4">데이터 부족</p>
                        )}
                      </div>
                      {/* 품목별 */}
                      <div>
                        <p className="text-xs font-semibold text-slate-400 mb-2">주요 품목</p>
                        <div className="space-y-1.5">
                          {topItems.map(([name, amt]) => (
                            <div key={name} className="flex items-center gap-2">
                              <p className="text-xs text-slate-400 flex-1 truncate">{name}</p>
                              <p className="text-xs font-semibold text-slate-300 tabular-nums whitespace-nowrap">{amt.toLocaleString()}원</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* 최근 거래 */}
                    <div>
                      <p className="text-xs font-semibold text-slate-400 mb-2">최근 거래</p>
                      <div className="space-y-1">
                        {stat.records.slice(0, 5).map(r => (
                          <div key={r.id} className="flex items-center gap-3 text-xs text-slate-500">
                            <span className="whitespace-nowrap">{r.purchaseDate}</span>
                            <span className="flex-1 text-slate-400 truncate">{r.items?.map(i => i.name).join(', ') || '-'}</span>
                            <span className="tabular-nums text-slate-300 whitespace-nowrap">{(r.totalAmount || 0).toLocaleString()}원</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <AIPurchasePanel currentPage="by-supplier" currentData={panelData} filters={{ start, end }} />
    </div>
  );
}
