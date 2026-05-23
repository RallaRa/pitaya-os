'use client';

import { useState, useEffect, useCallback } from 'react';
import WidgetWrapper from './WidgetWrapper';

interface Item { name: string; qty: number; amount: number; }
interface YesterdayData { dateLabel: string; top: Item[]; bottom: Item[]; }

export default function YesterdayWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<YesterdayData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q   = storeId ? `?storeId=${storeId}` : '';
      const res = await fetch(`/api/dashboard/yesterday-analysis${q}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('전일 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const RANK_COLOR = ['text-yellow-400', 'text-slate-300', 'text-orange-400', 'text-slate-400', 'text-slate-500'];

  return (
    <WidgetWrapper
      title="📅 전일 판매 분석"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="h-full overflow-y-auto p-3 space-y-3">
          {data.dateLabel && (
            <p className="text-slate-500 text-[10px] font-semibold">{data.dateLabel} 판매 현황</p>
          )}

          {/* TOP 5 */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">🥇 TOP 5 판매</p>
            {data.top.length === 0 ? (
              <p className="text-slate-600 text-xs">전일 데이터 없음</p>
            ) : (
              <div className="space-y-1">
                {data.top.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                    <span className={`text-[10px] font-bold w-4 shrink-0 text-center ${RANK_COLOR[i] || 'text-slate-500'}`}>{i + 1}</span>
                    <span className="text-slate-200 text-xs flex-1 truncate">{item.name}</span>
                    <span className="text-slate-400 text-[10px] shrink-0">{item.qty.toLocaleString()}개</span>
                    <span className="text-slate-500 text-[10px] shrink-0">{item.amount ? `${Math.round(item.amount / 1000)}K` : ''}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* BOTTOM 5 */}
          <div>
            <p className="text-[10px] text-slate-500 uppercase tracking-wider mb-1.5">📉 BOTTOM 5</p>
            {data.bottom.length === 0 ? (
              <p className="text-slate-600 text-xs">데이터 없음</p>
            ) : (
              <div className="space-y-1">
                {data.bottom.map((item, i) => (
                  <div key={i} className="flex items-center gap-2 bg-slate-800/30 rounded-lg px-2.5 py-1.5">
                    <span className="text-slate-200 text-xs flex-1 truncate">{item.name}</span>
                    <span className="text-slate-500 text-[10px] shrink-0">{item.qty.toLocaleString()}개</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
