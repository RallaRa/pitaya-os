'use client';

import dynamic from 'next/dynamic';
import { useState, useEffect, useCallback } from 'react';
import { Search, RefreshCw, TrendingUp, TrendingDown } from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { useStore } from '@/context/StoreContext';
import { db } from '@/lib/firebase/firebase';
import { collection, query, where, getDocs } from 'firebase/firestore';

const AIPurchasePanel = dynamic(() => import('@/components/purchases/AIPurchasePanel'), { ssr: false });

interface PriceHistory { date: string; price: number; supplierId?: string; }
interface ItemPrice {
  id: string; itemName: string; currentPrice: number; storeId: string;
  priceHistory?: PriceHistory[];
}
interface Rec {
  purchaseDate: string; supplierName: string;
  items?: { name: string; unitPrice?: number; supplyAmount?: number }[];
}

function calcStats(history: PriceHistory[]) {
  if (!history || history.length === 0) return { min: 0, max: 0, avg: 0, prevMonth: 0 };
  const prices = history.map(h => h.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = Math.round(prices.reduce((s, p) => s + p, 0) / prices.length);
  const now = new Date().toISOString().slice(0, 7);
  const prev = new Date(new Date().setMonth(new Date().getMonth() - 1)).toISOString().slice(0, 7);
  const prevPrices = history.filter(h => h.date?.startsWith(prev)).map(h => h.price);
  const prevMonth = prevPrices.length ? Math.round(prevPrices.reduce((s, p) => s + p, 0) / prevPrices.length) : 0;
  return { min, max, avg, prevMonth };
}

export default function ItemPricesPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [search, setSearch] = useState('');
  const [items,   setItems]  = useState<ItemPrice[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<ItemPrice | null>(null);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    try {
      /* item_prices Firestore collection */
      const q = query(collection(db, 'item_prices'), where('storeId', '==', storeId));
      const snap = await getDocs(q);
      const list: ItemPrice[] = snap.docs.map(d => ({ id: d.id, ...d.data() as any }));

      if (list.length === 0) {
        /* Firestore에 없으면 purchase_records에서 품목 단가 추출 */
        const h = await getAuthHeaders();
        const today = new Date().toISOString().split('T')[0];
        const yearAgo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const p = new URLSearchParams({ storeId, startDate: yearAgo, endDate: today });
        const d = await fetch(`/api/purchases?${p}`, { headers: h }).then(r => r.json());
        const records: Rec[] = d.records || [];

        const itemMap = new Map<string, PriceHistory[]>();
        records.forEach(r => {
          r.items?.forEach(it => {
            if (!it.unitPrice) return;
            const key = it.name;
            if (!itemMap.has(key)) itemMap.set(key, []);
            itemMap.get(key)!.push({ date: r.purchaseDate, price: it.unitPrice, supplierId: r.supplierName });
          });
        });

        const derived: ItemPrice[] = [...itemMap.entries()].map(([name, history]) => ({
          id: name, itemName: name, storeId,
          currentPrice: history[history.length - 1]?.price || 0,
          priceHistory: history.sort((a, b) => a.date.localeCompare(b.date)),
        }));
        setItems(derived);
      } else {
        setItems(list);
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const filtered = search ? items.filter(it => it.itemName?.includes(search)) : items;

  return (
    <div className="flex h-full min-h-screen bg-slate-950">
      <div className="flex-1 flex flex-col min-w-0 overflow-auto p-4 md:p-6 space-y-5">
        <div>
          <h1 className="text-2xl font-bold text-slate-100">품목별 단가</h1>
          <p className="text-slate-500 text-sm mt-0.5">매입 단가 현황 및 추이 분석</p>
        </div>

        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex flex-col gap-1">
            <label className="text-xs text-slate-500">품목 검색</label>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="품목명 입력"
              className="bg-slate-800 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 placeholder-slate-600 focus:outline-none focus:border-teal-500" />
          </div>
          <button onClick={load} disabled={loading}
            className="flex items-center gap-2 bg-teal-600 hover:bg-teal-500 text-white px-4 py-2 rounded-lg text-sm transition-colors disabled:opacity-50">
            {loading ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}새로고침
          </button>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          {/* 품목 목록 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-800">
              <p className="text-sm font-semibold text-slate-300">품목 단가 현황 ({filtered.length}개)</p>
            </div>
            <div className="overflow-auto max-h-[60vh]">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-500">
                    <th className="px-4 py-2.5 text-left">품목명</th>
                    <th className="px-4 py-2.5 text-right">현재단가</th>
                    <th className="px-4 py-2.5 text-right">전월평균</th>
                    <th className="px-4 py-2.5 text-right">변동</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={4} className="text-center py-8 text-slate-500">불러오는 중...</td></tr>}
                  {!loading && filtered.length === 0 && <tr><td colSpan={4} className="text-center py-8 text-slate-500">데이터가 없습니다</td></tr>}
                  {filtered.map(it => {
                    const { prevMonth } = calcStats(it.priceHistory || []);
                    const diff = prevMonth > 0 ? ((it.currentPrice - prevMonth) / prevMonth * 100) : 0;
                    const isUp = diff > 0;
                    return (
                      <tr key={it.id}
                        onClick={() => setSelected(it)}
                        className={`border-b border-slate-800/50 cursor-pointer transition-colors ${selected?.id === it.id ? 'bg-teal-600/10' : 'hover:bg-slate-800/30'}`}>
                        <td className="px-4 py-3 text-slate-200">{it.itemName}</td>
                        <td className="px-4 py-3 text-right text-slate-200 font-semibold tabular-nums">{it.currentPrice.toLocaleString()}원</td>
                        <td className="px-4 py-3 text-right text-slate-400 tabular-nums">{prevMonth > 0 ? `${prevMonth.toLocaleString()}원` : '-'}</td>
                        <td className="px-4 py-3 text-right">
                          {diff !== 0 && (
                            <span className={`flex items-center justify-end gap-0.5 font-semibold ${isUp ? 'text-red-400' : 'text-teal-400'}`}>
                              {isUp ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
                              {Math.abs(diff).toFixed(1)}%
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* 단가 추이 차트 */}
          <div className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            {selected ? (
              <>
                <p className="text-sm font-semibold text-slate-300 mb-1">{selected.itemName} 단가 추이</p>
                <p className="text-xs text-slate-500 mb-3">현재 {selected.currentPrice.toLocaleString()}원/kg</p>
                <ResponsiveContainer width="100%" height={220}>
                  <LineChart data={(selected.priceHistory || []).slice(-12).map(h => ({ date: h.date?.slice(5), price: h.price }))}>
                    <XAxis dataKey="date" tick={{ fill: '#64748b', fontSize: 10 }} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 10 }} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                    <Tooltip formatter={(v: number) => [`${v.toLocaleString()}원`, '단가']} contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8 }} />
                    <Line type="monotone" dataKey="price" stroke="#14b8a6" strokeWidth={2} dot={{ fill: '#14b8a6', r: 3 }} />
                  </LineChart>
                </ResponsiveContainer>
                {(() => {
                  const { min, max, avg } = calcStats(selected.priceHistory || []);
                  return (
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {[['최저', min, 'text-teal-400'], ['평균', avg, 'text-slate-300'], ['최고', max, 'text-red-400']].map(([label, v, c]) => (
                        <div key={label as string} className="text-center">
                          <p className="text-[10px] text-slate-500">{label as string}</p>
                          <p className={`text-xs font-semibold ${c as string}`}>{(v as number).toLocaleString()}원</p>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-600 text-sm">
                품목을 선택하면 단가 추이가 표시됩니다
              </div>
            )}
          </div>
        </div>
      </div>
      <AIPurchasePanel currentPage="prices" currentData={{ items: filtered.map(it => ({ name: it.itemName, price: it.currentPrice })) }} />
    </div>
  );
}
