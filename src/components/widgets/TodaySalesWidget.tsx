'use client';

import { useState, useEffect, useCallback } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { getDisplayTotalSale, getDisplayNetSales, type SalesDocData } from '@/lib/posDailySales';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { RefreshCw } from 'lucide-react';
import WidgetEmptyReason from './WidgetEmptyReason';

export default function TodaySalesWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [todayDoc,     setTodayDoc]     = useState<SalesDocData | null>(null);
  const [yesterdayDoc, setYesterdayDoc] = useState<SalesDocData | null>(null);
  const [emptyReason,  setEmptyReason]  = useState<string | null>(null);
  const [loading,      setLoading]      = useState(true);
  const [error,        setError]        = useState<string | null>(null);
  const [updatedAt,    setUpdatedAt]    = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) {
      setLoading(false);
      return;
    }
    try {
      const today = getKSTTodayYMD();
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/dashboard/today-sales?storeId=${encodeURIComponent(storeId)}&date=${today}`,
        { headers },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setTodayDoc(data.today ?? null);
      setYesterdayDoc(data.yesterday ?? null);
      setEmptyReason(data.emptyReason ?? null);
      setUpdatedAt(new Date());
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '매출 데이터를 불러오지 못했습니다');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    setLoading(true);
    fetchData();
    const interval = setInterval(fetchData, 30000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');
  const todayTotal = getDisplayTotalSale(todayDoc);
  const todayNet   = getDisplayNetSales(todayDoc);
  const yesterdayTotal = getDisplayTotalSale(yesterdayDoc);
  const isClosed = todayDoc?.isClosed ?? false;
  const todayStr = getKSTTodayYMD();
  const syncedAt = (todayDoc as { syncedAt?: string } | null)?.syncedAt;

  return (
    <WidgetWrapper
      title="📊 당일 매출 현황"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={fetchData}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {!storeId ? (
        <div className="p-3">
          <WidgetEmptyReason reason="매장이 선택되지 않았습니다. 상단에서 매장을 선택해 주세요." />
        </div>
      ) : (
        <div className="h-full p-3 flex flex-col gap-2 justify-center overflow-y-auto">
          {emptyReason && <WidgetEmptyReason reason={emptyReason} className="mb-1" />}
          <div className="flex items-center justify-between">
            <span className="text-slate-400 text-[10px]">{todayStr}</span>
            <div className="flex items-center gap-1.5">
              {isClosed
                ? <span className="text-[10px] px-1.5 py-0.5 bg-emerald-900/50 text-emerald-400 rounded-full border border-emerald-700/40">마감완료</span>
                : <span className="text-[10px] px-1.5 py-0.5 bg-yellow-900/50 text-yellow-400 rounded-full border border-yellow-700/40 animate-pulse">영업 중</span>
              }
              <RefreshCw className="w-3 h-3 text-slate-600" />
            </div>
          </div>

          <div className="text-center">
            <p className="text-slate-500 text-[10px] mb-1">오늘 매출</p>
            <p className="text-3xl font-bold text-teal-300">
              ₩ {fmt(todayTotal)}
            </p>
            <p className="text-slate-500 text-[10px] mt-0.5">순매출 {fmt(todayNet)}원</p>
          </div>

          <p className="text-center text-sm text-slate-400 scale-[0.85] origin-center">
            어제 ₩ {fmt(yesterdayTotal)}
          </p>

          {syncedAt && (
            <p className="text-slate-600 text-[9px] text-right">
              POS 동기화 {new Date(syncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
            </p>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
