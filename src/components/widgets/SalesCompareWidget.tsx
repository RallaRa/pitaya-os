'use client';

import { useState, useEffect, useCallback } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface PeriodStat { label: string; net: number; total: number; customers: number; }
interface CompareBlock { current: PeriodStat; previous: PeriodStat; pct: number | null; }
interface SalesCompareData { week: CompareBlock; month: CompareBlock; }

export default function SalesCompareWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<SalesCompareData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true); setError(null);
    try {
      const res = await fetch(`/api/dashboard/sales-compare?storeId=${storeId}`, {
        headers: await getAuthHeaders(),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('매출 비교 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const DiffBadge = ({ pct }: { pct: number | null }) => {
    if (pct === null) return <span className="text-slate-500 text-[10px]">비교 불가</span>;
    const color  = pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-slate-400';
    const Icon   = pct > 0 ? TrendingUp : pct < 0 ? TrendingDown : Minus;
    return (
      <span className={`flex items-center gap-0.5 text-xs font-semibold ${color}`}>
        <Icon className="w-3.5 h-3.5" />
        {pct > 0 ? '+' : ''}{pct}%
      </span>
    );
  };

  const Block = ({ block, label }: { block: CompareBlock; label: string }) => (
    <div className="bg-slate-800/50 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-slate-400 text-xs font-semibold">{label}</span>
        <DiffBadge pct={block.pct} />
      </div>

      <div className="grid grid-cols-2 gap-2">
        {/* 이번 기간 */}
        <div className="space-y-0.5">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">{block.current.label}</p>
          <p className="text-white font-bold text-sm">{fmt(block.current.net)}<span className="text-slate-500 text-[10px] ml-0.5">원</span></p>
          <p className="text-slate-500 text-[9px]">고객 {block.current.customers}명</p>
        </div>

        {/* 지난 기간 */}
        <div className="space-y-0.5 text-right">
          <p className="text-slate-500 text-[9px] uppercase tracking-wider">{block.previous.label}</p>
          <p className="text-slate-400 font-semibold text-sm">{fmt(block.previous.net)}<span className="text-slate-600 text-[10px] ml-0.5">원</span></p>
          <p className="text-slate-600 text-[9px]">고객 {block.previous.customers}명</p>
        </div>
      </div>

      {/* 바 차트 비교 */}
      {block.previous.net > 0 && (
        <div className="space-y-1 pt-1">
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500 w-10 text-right shrink-0">{block.current.label}</span>
            <div className="flex-1 bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-teal-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, block.previous.net > 0 ? (block.current.net / Math.max(block.current.net, block.previous.net)) * 100 : 0)}%` }}
              />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] text-slate-500 w-10 text-right shrink-0">{block.previous.label}</span>
            <div className="flex-1 bg-slate-700/50 rounded-full h-1.5 overflow-hidden">
              <div
                className="h-full bg-slate-500 rounded-full transition-all duration-500"
                style={{ width: `${Math.min(100, block.current.net > 0 ? (block.previous.net / Math.max(block.current.net, block.previous.net)) * 100 : 0)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );

  return (
    <WidgetWrapper
      title="📈 매출 비교"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="h-full overflow-y-auto p-3 space-y-3">
          {!storeId ? (
            <p className="text-slate-500 text-xs text-center mt-4">매장을 선택하세요</p>
          ) : (
            <>
              <Block block={data.week}  label="주간 비교" />
              <Block block={data.month} label="월간 비교" />
            </>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
