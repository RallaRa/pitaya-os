'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowLeft, Loader2, Package, Info } from 'lucide-react';
import { useStore } from '@/context/StoreContext';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { InventoryTurnoverRow } from '@/lib/inventoryTurnoverCalc';

const TIER_COLORS = {
  high: 'text-teal-400 bg-teal-950/30 border-teal-500/30',
  medium: 'text-amber-300 bg-amber-950/20 border-amber-500/30',
  low: 'text-red-400 bg-red-950/20 border-red-500/30',
};

function TrendBars({ trend }: { trend: InventoryTurnoverRow['trend'] }) {
  const max = Math.max(...trend.map(t => t.soldQty), 1);
  return (
    <div className="flex items-end gap-0.5 h-6">
      {trend.map(w => (
        <div
          key={w.weekLabel}
          title={`${w.weekLabel}: ${w.soldQty}`}
          className="w-2 bg-slate-600 rounded-sm"
          style={{ height: `${Math.max(8, (w.soldQty / max) * 100)}%` }}
        />
      ))}
    </div>
  );
}

export default function InventoryTurnoverPage() {
  const { currentStore } = useStore();
  const storeId = currentStore?.storeId || '';
  const [items, setItems] = useState<InventoryTurnoverRow[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [counts, setCounts] = useState({ high: 0, medium: 0, low: 0 });
  const [loading, setLoading] = useState(true);
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
        `/api/dashboard/inventory-turnover?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setItems(d.items || []);
      setInsights(d.insights || []);
      setCounts({ high: d.highCount || 0, medium: d.mediumCount || 0, low: d.lowCount || 0 });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '불러오기 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <div className="min-h-full bg-slate-950 text-slate-200 p-4 md:p-6 max-w-4xl mx-auto">
      <div className="flex items-center gap-3 mb-6">
        <Link href="/dashboard" className="p-2 rounded-lg hover:bg-slate-800 text-slate-400">
          <ArrowLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-lg font-semibold flex items-center gap-2">
            <Package className="w-5 h-5 text-teal-400" />
            재고 회전율 분석
          </h1>
          <p className="text-xs text-slate-500 flex items-center gap-1">
            <Info className="w-3 h-3" /> 추정치 — POS 판매량 + 재고 임계값 기반
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16"><Loader2 className="w-6 h-6 animate-spin text-teal-400" /></div>
      ) : error ? (
        <p className="text-red-400 text-sm">{error}</p>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3 text-center">
            <div className="rounded-xl border border-teal-500/30 bg-teal-950/20 p-3">
              <p className="text-2xl font-bold text-teal-400">{counts.high}</p>
              <p className="text-[10px] text-slate-500">고회전</p>
            </div>
            <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-3">
              <p className="text-2xl font-bold text-amber-300">{counts.medium}</p>
              <p className="text-[10px] text-slate-500">보통</p>
            </div>
            <div className="rounded-xl border border-red-500/30 bg-red-950/20 p-3">
              <p className="text-2xl font-bold text-red-400">{counts.low}</p>
              <p className="text-[10px] text-slate-500">저회전</p>
            </div>
          </div>

          {insights.length > 0 && (
            <ul className="text-xs text-slate-400 space-y-1 rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              {insights.map(i => <li key={i}>· {i}</li>)}
            </ul>
          )}

          <div className="rounded-xl border border-slate-800 overflow-x-auto">
            <table className="w-full text-xs min-w-[640px]">
              <thead className="bg-slate-900/80 text-slate-400">
                <tr>
                  <th className="text-left px-3 py-2">품목</th>
                  <th className="text-right px-2 py-2">28일 판매</th>
                  <th className="text-right px-2 py-2">주 회전</th>
                  <th className="text-left px-2 py-2">등급</th>
                  <th className="text-right px-2 py-2">발주 제안</th>
                  <th className="px-2 py-2">4주</th>
                </tr>
              </thead>
              <tbody>
                {items.map(row => (
                  <tr key={row.itemId} className="border-t border-slate-800/80">
                    <td className="px-3 py-2">
                      {row.itemName}
                      {row.isEstimated && <span className="text-slate-600 ml-1">(추정)</span>}
                      {row.alert === 'understock' && <span className="text-amber-400 ml-1">⚠ 부족</span>}
                      {row.alert === 'overstock' && <span className="text-red-400 ml-1">⚠ 과잉</span>}
                    </td>
                    <td className="text-right px-2 tabular-nums">{row.soldQty28d}{row.unit}</td>
                    <td className="text-right px-2 tabular-nums">{row.weeklyTurnover.toFixed(1)}</td>
                    <td className="px-2">
                      <span className={`px-1.5 py-0.5 rounded border text-[10px] ${TIER_COLORS[row.tier]}`}>
                        {row.tierLabel.split(' ')[0]}
                      </span>
                    </td>
                    <td className="text-right px-2 tabular-nums text-teal-300">
                      {row.reorderSuggestion > 0 ? `+${row.reorderSuggestion}${row.unit}` : '—'}
                    </td>
                    <td className="px-2"><TrendBars trend={row.trend} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Link href="/dashboard/settings/pos-stock" className="block text-center text-xs text-teal-400 hover:text-teal-300">
            재고 임계값 설정 →
          </Link>
        </div>
      )}
    </div>
  );
}
