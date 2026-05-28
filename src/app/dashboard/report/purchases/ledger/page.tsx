'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, TrendingDown, CreditCard, Banknote, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

const PIE_COLORS = ['#14b8a6', '#6366f1', '#f59e0b', '#22c55e', '#ec4899', '#f97316'];
const PAY_COLORS: Record<string, string> = { 현금: '#14b8a6', 신용카드: '#6366f1', 외상: '#f59e0b', 계좌이체: '#22c55e' };

interface Rec {
  id: string; purchaseDate: string; supplierName: string;
  items?: { name: string }[]; totalAmount: number;
  paymentMethod?: string; memo?: string;
}

export default function PurchaseLedgerPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const today = new Date().toISOString().split('T')[0];
  const firstOfMonth = today.slice(0, 8) + '01';

  const [start,    setStart]   = useState(firstOfMonth);
  const [end,      setEnd]     = useState(today);
  const [supplier, setSupp]    = useState('');
  const [records,  setRecords] = useState<Rec[]>([]);
  const [loading,  setLoading] = useState(false);

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

  const filtered = supplier ? records.filter(r => r.supplierName?.includes(supplier)) : records;
  const total  = filtered.reduce((s, r) => s + (r.totalAmount || 0), 0);
  const cash   = filtered.filter(r => r.paymentMethod === '현금').reduce((s, r) => s + (r.totalAmount || 0), 0);
  const card   = filtered.filter(r => r.paymentMethod === '신용카드').reduce((s, r) => s + (r.totalAmount || 0), 0);
  const credit = filtered.filter(r => r.paymentMethod === '외상').reduce((s, r) => s + (r.totalAmount || 0), 0);

  const monthlyMap = new Map<string, number>();
  filtered.forEach(r => { const m = r.purchaseDate?.slice(0, 7); if (m) monthlyMap.set(m, (monthlyMap.get(m) || 0) + (r.totalAmount || 0)); });
  const monthlyData = [...monthlyMap.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, amount]) => ({ month: month.slice(5), amount }));

  const suppMap = new Map<string, number>();
  filtered.forEach(r => { const n = r.supplierName || '기타'; suppMap.set(n, (suppMap.get(n) || 0) + (r.totalAmount || 0)); });
  const pieData = [...suppMap.entries()].sort(([, a], [, b]) => b - a).slice(0, 6).map(([name, value]) => ({ name, value }));

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">매입 원장</h1>
          <p className="text-slate-500 text-sm mt-0.5">전체 매입 내역 조회 및 분석</p>
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
            <label className="text-xs text-slate-500">거래처</label>
            <input value={supplier} onChange={e => setSupp(e.target.value)} placeholder="거래처명"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}조회
          </button>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: '총 매입액', v: total, icon: <TrendingDown className="w-4 h-4" />, c: 'text-teal-400' },
            { label: '현금', v: cash, icon: <Banknote className="w-4 h-4" />, c: 'text-green-400' },
            { label: '카드', v: card, icon: <CreditCard className="w-4 h-4" />, c: 'text-indigo-400' },
            { label: '외상', v: credit, icon: <AlertCircle className="w-4 h-4" />, c: 'text-amber-400' },
          ].map(({ label, v, icon, c }) => (
            <div key={label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <div className={`flex items-center gap-1.5 text-xs ${c} mb-1`}>{icon}{label}</div>
              <p className="text-lg font-bold text-slate-100">{v.toLocaleString()}원</p>
            </div>
          ))}
        </div>

        {filtered.length > 0 && (
          <div className="grid md:grid-cols-2 gap-4">
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-300 mb-3">월별 매입 추이</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={monthlyData}>
                  <XAxis dataKey="month" tick={{ fill: '#64748b', fontSize: 11 }} />
                  <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${(v / 10000).toFixed(0)}만`} />
                  <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`, '매입액']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                  <Bar dataKey="amount" fill="#14b8a6" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
              <p className="text-sm font-semibold text-slate-300 mb-3">거래처 비중</p>
              <ResponsiveContainer width="100%" height={160}>
                <PieChart>
                  <Pie data={pieData} cx="50%" cy="50%" outerRadius={60} dataKey="value" fontSize={10}>
                    {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => `${v.toLocaleString()}원`} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        )}

        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-800 text-slate-500">
                  <th className="px-4 py-3 text-left">날짜</th>
                  <th className="px-4 py-3 text-left">거래처</th>
                  <th className="px-4 py-3 text-left">품목</th>
                  <th className="px-4 py-3 text-right">금액</th>
                  <th className="px-4 py-3 text-left">결제</th>
                  <th className="px-4 py-3 text-left">메모</th>
                </tr>
              </thead>
              <tbody>
                {loading && <tr><td colSpan={6} className="text-center py-8 text-slate-500">불러오는 중...</td></tr>}
                {!loading && filtered.length === 0 && <tr><td colSpan={6} className="text-center py-8 text-slate-500">조회된 내역이 없습니다</td></tr>}
                {filtered.map(r => (
                  <tr key={r.id} className="border-b border-slate-800/50 hover:bg-slate-800/30">
                    <td className="px-4 py-3 text-slate-400 whitespace-nowrap">{r.purchaseDate}</td>
                    <td className="px-4 py-3 text-slate-200 font-medium whitespace-nowrap">{r.supplierName || '-'}</td>
                    <td className="px-4 py-3 text-slate-400">{r.items?.map(i => i.name).join(', ') || '-'}</td>
                    <td className="px-4 py-3 text-right text-slate-200 font-semibold tabular-nums whitespace-nowrap">{(r.totalAmount || 0).toLocaleString()}원</td>
                    <td className="px-4 py-3">
                      {r.paymentMethod
                        ? <span className="px-2 py-0.5 rounded-full text-[10px] font-medium" style={{ background: `${PAY_COLORS[r.paymentMethod] || '#475569'}22`, color: PAY_COLORS[r.paymentMethod] || '#94a3b8' }}>{r.paymentMethod}</span>
                        : '-'}
                    </td>
                    <td className="px-4 py-3 text-slate-500 truncate max-w-[120px]">{r.memo || '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
      <AIPurchasePanel currentPage="ledger" currentData={{ records: filtered, period: `${start}~${end}` }} filters={{ start, end, supplier }} />
    </div>
  );
}
