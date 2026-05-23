'use client';

import { useState, useEffect, useCallback } from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';

interface Item { name: string; qty: number; amount: number; pctChange?: number | null; }
interface AnalysisData { top: Item[]; bottom: Item[]; insight: string; }

export default function WeeklyAnalysisWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<AnalysisData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q   = storeId ? `?storeId=${storeId}` : '';
      const res = await fetch(`/api/dashboard/weekly-analysis${q}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('분석 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { load(); }, [load]);

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <WidgetWrapper
      title="📊 AI 주간 판매 분석"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="h-full overflow-y-auto p-3 space-y-3">
          {/* TOP 3 */}
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">🏆 주간 TOP 3</p>
            <div className="space-y-1">
              {data.top.length === 0 ? (
                <p className="text-slate-600 text-xs">데이터 없음</p>
              ) : data.top.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800/50 rounded-lg px-2.5 py-1.5">
                  <span className="text-sm shrink-0">{MEDALS[i] || '•'}</span>
                  <span className="text-slate-200 text-xs flex-1 truncate">{item.name}</span>
                  <span className="text-slate-400 text-[10px] shrink-0">{item.qty.toLocaleString()}개</span>
                  {item.pctChange != null && (
                    <span className={`text-[9px] shrink-0 flex items-center gap-0.5 ${item.pctChange >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {item.pctChange >= 0 ? <TrendingUp className="w-2.5 h-2.5" /> : <TrendingDown className="w-2.5 h-2.5" />}
                      {Math.abs(item.pctChange)}%
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* BOTTOM 3 */}
          <div>
            <p className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider mb-1.5">📉 주간 BOTTOM 3</p>
            <div className="space-y-1">
              {data.bottom.length === 0 ? (
                <p className="text-slate-600 text-xs">데이터 없음</p>
              ) : data.bottom.map((item, i) => (
                <div key={i} className="flex items-center gap-2 bg-slate-800/30 rounded-lg px-2.5 py-1.5">
                  <span className="text-slate-200 text-xs flex-1 truncate">{item.name}</span>
                  <span className="text-slate-500 text-[10px] shrink-0">{item.qty.toLocaleString()}개</span>
                </div>
              ))}
            </div>
          </div>

          {/* AI 인사이트 */}
          {data.insight && (
            <div className="bg-teal-900/20 border border-teal-700/30 rounded-lg px-3 py-2">
              <p className="text-[10px] text-teal-400 font-semibold mb-0.5">💡 AI 인사이트</p>
              <p className="text-xs text-slate-300 leading-snug">{data.insight}</p>
            </div>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
