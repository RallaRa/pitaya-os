'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { ArrowRight, Package } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetEmptyReason from './WidgetEmptyReason';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type { InventoryTurnoverRow } from '@/lib/inventoryTurnoverCalc';

const TIER_DOT = { high: 'bg-teal-400', medium: 'bg-amber-400', low: 'bg-red-400' };

export default function InventoryTurnoverWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [items, setItems] = useState<InventoryTurnoverRow[]>([]);
  const [insights, setInsights] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/dashboard/inventory-turnover?storeId=${encodeURIComponent(storeId)}`,
        { headers: await getAuthHeaders() },
      );
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || '조회 실패');
      setItems((d.items || []).slice(0, 8));
      setInsights(d.insights || []);
      setUpdatedAt(new Date());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '재고 회전율을 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  return (
    <WidgetWrapper
      title="📦 재고 회전율"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3"><WidgetEmptyReason reason="매장이 선택되지 않았습니다." /></div>
      ) : items.length === 0 && !loading ? (
        <div className="p-3"><WidgetEmptyReason reason="회전율 데이터가 없습니다." /></div>
      ) : (
        <div className="h-full p-3 flex flex-col gap-2 overflow-hidden">
          <div className="flex justify-between text-[10px]">
            <span className="text-slate-500">최근 28일 · 추정</span>
            <Link href="/dashboard/inventory/turnover" className="text-teal-400 flex items-center gap-0.5">
              전체 <ArrowRight className="w-3 h-3" />
            </Link>
          </div>
          {insights[0] && (
            <p className="text-[9px] text-slate-500 truncate">{insights[0]}</p>
          )}
          <ul className="flex-1 overflow-y-auto space-y-1 min-h-0">
            {items.map(row => (
              <li
                key={row.itemId}
                className="flex items-center gap-2 px-2 py-1 rounded-lg bg-slate-800/60 border border-slate-700/50 text-[10px]"
              >
                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${TIER_DOT[row.tier]}`} />
                <span className="flex-1 truncate text-slate-200">{row.itemName}</span>
                <span className="tabular-nums text-slate-400">{row.weeklyTurnover.toFixed(1)}/주</span>
                {row.reorderSuggestion > 0 && (
                  <span className="text-teal-400 tabular-nums">+{row.reorderSuggestion}</span>
                )}
              </li>
            ))}
          </ul>
          <p className="text-[9px] text-slate-600 flex items-center gap-1">
            <Package className="w-3 h-3" /> 초록=고회전 · 노랑=보통 · 빨강=저회전
          </p>
        </div>
      )}
    </WidgetWrapper>
  );
}
