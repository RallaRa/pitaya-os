'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  ChevronLeft, ChevronRight, Loader2, History, X, Check,
} from 'lucide-react';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import type {
  ItemPriceHistoryResult,
  PurchaseLineEntry,
  UnitPricePeriod,
} from '@/lib/purchaseUnitPriceHistory';

const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');

interface Props {
  storeId: string;
  itemName: string;
  itemUnit?: string;
  referenceDate?: string;
  onClose: () => void;
  onSelectPrice?: (unitPrice: number, line: PurchaseLineEntry) => void;
  collapsed?: boolean;
  onToggleCollapse?: () => void;
}

export default function PurchaseItemPriceHistoryPanel({
  storeId,
  itemName,
  itemUnit = 'kg',
  referenceDate,
  onClose,
  onSelectPrice,
  collapsed = false,
  onToggleCollapse,
}: Props) {
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ItemPriceHistoryResult | null>(null);
  const [error, setError] = useState('');
  const [showLines, setShowLines] = useState(false);
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    if (!storeId || !itemName.trim()) return;
    setLoading(true);
    setError('');
    try {
      const today = new Date().toISOString().slice(0, 10);
      const yearAgo = new Date(Date.now() - 365 * 86400000).toISOString().slice(0, 10);
      const p = new URLSearchParams({
        storeId,
        itemName: itemName.trim(),
        startDate: yearAgo,
        endDate: today,
      });
      const res = await fetch(`/api/purchases/item-price-history?${p}`, {
        headers: await getAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || '조회 실패');
      setData(json);
      setLoaded(true);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '단가 이력 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId, itemName]);

  useEffect(() => {
    if (!loaded) load();
  }, [load, loaded]);

  if (collapsed) {
    return (
      <div className="w-8 shrink-0 border-l border-slate-800 bg-slate-900/80 flex flex-col items-center py-2">
        <button
          type="button"
          onClick={onToggleCollapse}
          className="text-slate-500 hover:text-teal-400 p-1"
          title="단가 히스토리 펼치기"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <History className="w-4 h-4 text-slate-600 mt-2" />
      </div>
    );
  }

  return (
    <div className="w-72 lg:w-80 shrink-0 border-l border-slate-800 bg-slate-900/95 flex flex-col max-h-[70vh] lg:max-h-none sticky top-0">
      <div className="flex items-center gap-1 px-2 py-2 border-b border-slate-800 shrink-0">
        <History className="w-3.5 h-3.5 text-teal-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-[10px] font-semibold text-slate-200 truncate">{itemName}</p>
          <p className="text-[9px] text-slate-500">단가 히스토리 · 더블클릭</p>
        </div>
        {onToggleCollapse && (
          <button type="button" onClick={onToggleCollapse} className="text-slate-500 hover:text-slate-300 p-0.5" title="접기">
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
        <button type="button" onClick={onClose} className="text-slate-500 hover:text-slate-300 p-0.5" title="닫기">
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2 space-y-2 min-h-0">
        {loading && (
          <div className="flex items-center justify-center py-8 text-slate-500 text-xs gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> 불러오는 중…
          </div>
        )}
        {error && <p className="text-xs text-red-400">{error}</p>}

        {data && !loading && (
          <>
            <div className="bg-teal-900/25 border border-teal-700/40 rounded-lg p-2">
              <p className="text-[9px] text-slate-500">표시 단가 ({data.today})</p>
              <p className="text-lg font-bold text-teal-300 tabular-nums">
                {data.displayPrice > 0 ? `${fmt(data.displayPrice)}원` : '-'}
                <span className="text-[10px] font-normal text-slate-500 ml-1">/{itemUnit}</span>
              </p>
              <p className="text-[9px] text-slate-500 mt-0.5 leading-snug">{data.displayPriceBasis}</p>
              {referenceDate && referenceDate !== data.today && (
                <p className="text-[9px] text-amber-500/80 mt-1">명세일 {referenceDate} · 당일 기준 표시</p>
              )}
            </div>

            <div>
              <p className="text-[10px] font-semibold text-slate-400 mb-1">기간별 단가 (from ~ to)</p>
              {data.periods.length === 0 ? (
                <p className="text-[10px] text-slate-600">저장된 매입 이력이 없습니다.</p>
              ) : (
                <div className="space-y-1">
                  {data.periods.slice().reverse().map((p: UnitPricePeriod, i) => (
                    <div key={i} className="bg-slate-800/50 rounded px-2 py-1.5 border border-slate-700/40">
                      <p className="text-[10px] text-slate-200 tabular-nums">
                        {p.from} ~ {p.to || '현재'}
                      </p>
                      <p className="text-[11px] font-semibold text-teal-300 tabular-nums">
                        {fmt(p.unitPrice)}원/{itemUnit}
                        <span className="text-[9px] font-normal text-slate-500 ml-1">
                          (가중평균 {fmt(p.avgUnitPrice)})
                        </span>
                      </p>
                      <p className="text-[9px] text-slate-500">
                        {p.entryCount}건 · {fmt(p.totalQty)}{itemUnit} · {fmt(p.totalAmount)}원
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <details open={showLines} onToggle={e => setShowLines((e.target as HTMLDetailsElement).open)}>
              <summary className="text-[10px] font-semibold text-slate-400 cursor-pointer select-none list-none flex items-center gap-1 [&::-webkit-details-marker]:hidden">
                상세 내역 ({data.lines.length}건)
                <span className="text-slate-600 font-normal">· 동일일 중복 선택</span>
              </summary>
              <div className="mt-1 space-y-0.5 max-h-48 overflow-y-auto">
                {[...data.lines].reverse().map((line, i) => (
                  <button
                    key={`${line.purchaseRecordId}-${i}`}
                    type="button"
                    onClick={() => onSelectPrice?.(line.unitPrice, line)}
                    className="w-full text-left bg-slate-800/40 hover:bg-slate-800 rounded px-2 py-1 border border-transparent hover:border-teal-700/40 transition-colors group"
                  >
                    <div className="flex justify-between gap-1">
                      <span className="text-[9px] text-slate-400 tabular-nums">{line.purchaseDate}</span>
                      <span className="text-[10px] text-teal-300 font-semibold tabular-nums">
                        {fmt(line.unitPrice)}원
                      </span>
                    </div>
                    <p className="text-[9px] text-slate-500 truncate">
                      {line.supplierName} · {line.qty}{line.unit}
                    </p>
                    {onSelectPrice && (
                      <span className="text-[8px] text-teal-600 opacity-0 group-hover:opacity-100">단가 적용</span>
                    )}
                  </button>
                ))}
              </div>
            </details>

            {onSelectPrice && (
              <p className="text-[9px] text-slate-600 flex items-center gap-1">
                <Check className="w-3 h-3" /> 상세 내역 클릭 → 현재 품목 단가 반영
              </p>
            )}
          </>
        )}
      </div>
    </div>
  );
}
