'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { Loader2, TrendingDown } from 'lucide-react';

interface Row {
  itemName: string;
  suppliers: { name: string; unitPrice: number; lastDate: string }[];
  minPrice: number;
  minSupplier: string;
}

export default function SupplierPriceComparePage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!storeId) return;
    setLoading(true);
    const headers = await getAuthHeaders();
    const res = await fetch(`/api/purchases/supplier-price-compare?storeId=${encodeURIComponent(storeId)}`, { headers });
    const data = await res.json();
    setRows(data.rows || []);
    setLoading(false);
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const supplierNames = [...new Set(rows.flatMap(r => r.suppliers.map(s => s.name)))].sort();

  return (
    <div className="p-6">
      <h1 className="text-xl font-bold text-teal-400 mb-1 flex items-center gap-2">
        <TrendingDown className="w-5 h-5" /> 거래처 단가 비교
      </h1>
      <p className="text-slate-500 text-sm mb-6">동일 품목 · 거래처별 최신 매입단가</p>

      {loading ? (
        <Loader2 className="w-6 h-6 animate-spin text-teal-400" />
      ) : rows.length === 0 ? (
        <p className="text-slate-600 text-sm">2곳 이상 거래처에서 구매한 품목이 없습니다.</p>
      ) : (
        <div className="overflow-x-auto bg-slate-900 border border-slate-700 rounded-xl">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-slate-500 text-xs">
                <th className="text-left p-3">품목</th>
                {supplierNames.map(n => <th key={n} className="text-right p-3">{n}</th>)}
                <th className="text-right p-3">최저</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(row => (
                <tr key={row.itemName} className="border-b border-slate-800/60">
                  <td className="p-3 text-slate-200">{row.itemName}</td>
                  {supplierNames.map(n => {
                    const s = row.suppliers.find(x => x.name === n);
                    const isMin = s && s.unitPrice === row.minPrice;
                    return (
                      <td key={n} className={`p-3 text-right ${isMin ? 'text-teal-400 font-semibold' : 'text-slate-400'}`}>
                        {s ? `${s.unitPrice.toLocaleString()}원` : '—'}
                      </td>
                    );
                  })}
                  <td className="p-3 text-right text-teal-300 text-xs">{row.minSupplier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="mt-4 text-xs text-slate-600">
        <Link href="/dashboard/report/purchases/input" className="text-teal-500 hover:underline">매입 등록</Link>에서 단가를 갱신하세요.
      </p>
    </div>
  );
}
