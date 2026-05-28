'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { TrendingUp, TrendingDown, Minus, Users, RefreshCw } from 'lucide-react';

interface TodaySalesData {
  todayStr:       string;
  totalSales:     number;
  netSales:       number;
  returnAmount:   number;
  customerCount:  number;
  isClosed:       boolean;
  syncedAt:       string | null;
  yesterdayNet:   number;
  diffAmt:        number;
  diffPct:        number | null;
  noData:         boolean;
}

const AUTO_REFRESH_MS = 60 * 1000; // 1분 자동 갱신

export default function TodaySalesWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<TodaySalesData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const load = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/dashboard/today-sales?storeId=${storeId}`, {
        headers: await getAuthHeaders(),
      });
      const d = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('당일 매출 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
    timerRef.current = setInterval(load, AUTO_REFRESH_MS);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [load]);

  const fmt = (n: number) => n.toLocaleString('ko-KR');

  const diffIcon = !data || data.diffPct === null ? null
    : data.diffPct > 0 ? <TrendingUp  className="w-4 h-4 text-emerald-400" />
    : data.diffPct < 0 ? <TrendingDown className="w-4 h-4 text-red-400" />
    : <Minus className="w-4 h-4 text-slate-400" />;

  const diffColor = !data || data.diffPct === null ? 'text-slate-400'
    : data.diffPct > 0 ? 'text-emerald-400'
    : data.diffPct < 0 ? 'text-red-400'
    : 'text-slate-400';

  return (
    <WidgetWrapper
      title="📊 당일 매출 현황"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="h-full p-3 flex flex-col gap-3">
          {!storeId ? (
            <p className="text-slate-500 text-xs text-center mt-4">매장을 선택하세요</p>
          ) : data.noData ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2">
              <TrendingUp className="w-8 h-8 text-slate-700" />
              <p className="text-slate-500 text-xs text-center">당일 매출 데이터가 없습니다</p>
              <p className="text-slate-600 text-[10px] text-center">POS 연동 후 자동으로 갱신됩니다<br/>(매 1분)</p>
            </div>
          ) : (
            <>
              {/* 상태 뱃지 */}
              <div className="flex items-center justify-between">
                <span className="text-slate-400 text-[10px]">{data.todayStr}</span>
                <div className="flex items-center gap-1.5">
                  {data.isClosed
                    ? <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded-full border border-emerald-700/40">마감완료</span>
                    : <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/50 text-yellow-400 rounded-full border border-yellow-700/40 animate-pulse">실시간</span>
                  }
                  <RefreshCw className="w-3 h-3 text-slate-600" />
                </div>
              </div>

              {/* 순매출 메인 */}
              <div className="bg-slate-800/60 rounded-xl p-3 text-center">
                <p className="text-slate-500 text-[10px] mb-1">순매출</p>
                <p className="text-2xl font-bold text-white">{fmt(data.netSales)}<span className="text-sm text-slate-400 ml-1">원</span></p>

                {data.diffPct !== null && (
                  <div className={`flex items-center justify-center gap-1 mt-1 text-xs ${diffColor}`}>
                    {diffIcon}
                    <span>전일 대비 {data.diffPct > 0 ? '+' : ''}{data.diffPct}%</span>
                    <span className="text-slate-500">({data.diffAmt > 0 ? '+' : ''}{fmt(data.diffAmt)}원)</span>
                  </div>
                )}
              </div>

              {/* 보조 지표 */}
              <div className="grid grid-cols-3 gap-2">
                <div className="bg-slate-800/40 rounded-lg p-2 text-center">
                  <p className="text-slate-500 text-[9px] mb-0.5">총매출</p>
                  <p className="text-slate-200 text-xs font-semibold">{fmt(data.totalSales)}</p>
                  <p className="text-slate-600 text-[9px]">원</p>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-2 text-center">
                  <p className="text-slate-500 text-[9px] mb-0.5">반품</p>
                  <p className="text-red-400 text-xs font-semibold">{data.returnAmount > 0 ? `-${fmt(data.returnAmount)}` : '0'}</p>
                  <p className="text-slate-600 text-[9px]">원</p>
                </div>
                <div className="bg-slate-800/40 rounded-lg p-2 text-center">
                  <div className="flex items-center justify-center gap-0.5 mb-0.5">
                    <Users className="w-2.5 h-2.5 text-slate-500" />
                    <p className="text-slate-500 text-[9px]">고객수</p>
                  </div>
                  <p className="text-blue-400 text-xs font-semibold">{fmt(data.customerCount)}</p>
                  <p className="text-slate-600 text-[9px]">명</p>
                </div>
              </div>

              {/* 전일 비교 */}
              {data.yesterdayNet > 0 && (
                <div className="bg-slate-800/30 rounded-lg px-3 py-2 flex items-center justify-between">
                  <span className="text-slate-500 text-[10px]">전일 순매출</span>
                  <span className="text-slate-400 text-xs">{fmt(data.yesterdayNet)}원</span>
                </div>
              )}

              {data.syncedAt && (
                <p className="text-slate-600 text-[9px] text-right">마지막 POS 동기화: {new Date(data.syncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}</p>
              )}
            </>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
