'use client';

import { useCallback, useEffect, useState } from 'react';
import WidgetWrapper from './WidgetWrapper';
import WidgetAsyncBoundary from '@/components/suspense/WidgetAsyncBoundary';
import EmptyState from '@/components/suspense/EmptyState';
import { fetchAuthJson } from '@/components/suspense/fetchJson';
import { useSuspenseInvalidate, useSuspenseResource } from '@/components/suspense/useSuspenseResource';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { getDisplayNetSales, getDisplayReturnAmount, type SalesDocData } from '@/lib/posDailySales';
import { RefreshCw } from 'lucide-react';

interface TodaySalesPayload {
  today?: SalesDocData | null;
  yesterday?: SalesDocData | null;
  emptyReason?: string | null;
}

function cacheKey(storeId: string) {
  return `dashboard:today-sales:${storeId}:${getKSTTodayYMD()}`;
}

function TodaySalesContent({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId: string }) {
  const key = cacheKey(storeId);
  const invalidate = useSuspenseInvalidate(key);
  const data = useSuspenseResource(key, async () => {
    const today = getKSTTodayYMD();
    return fetchAuthJson<TodaySalesPayload>(
      `/api/dashboard/today-sales?storeId=${encodeURIComponent(storeId)}&date=${today}`,
    );
  });
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [data]);

  const refresh = useCallback(() => invalidate(), [invalidate]);

  useEffect(() => {
    const interval = setInterval(refresh, 30000);
    return () => clearInterval(interval);
  }, [refresh]);

  const fmt = (n: number) => (n || 0).toLocaleString('ko-KR');
  const todayDoc = data.today ?? null;
  const yesterdayDoc = data.yesterday ?? null;
  const todayNet = getDisplayNetSales(todayDoc);
  const todayReturn = getDisplayReturnAmount(todayDoc);
  const yesterdayNet = getDisplayNetSales(yesterdayDoc);
  const isClosed = todayDoc?.isClosed ?? false;
  const todayStr = getKSTTodayYMD();
  const syncedAt = (todayDoc as { syncedAt?: string } | null)?.syncedAt;

  return (
    <WidgetWrapper
      title="📊 당일 매출 현황"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      <div className="h-full p-3 flex flex-col gap-2 justify-center overflow-y-auto">
        {data.emptyReason && <EmptyState reason={data.emptyReason} />}
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
          <p className="text-slate-500 text-[10px] mb-1">오늘 순매출</p>
          <p className="text-3xl font-bold text-teal-300">₩ {fmt(todayNet)}</p>
          <p className="text-[10px] mt-0.5">
            반품{' '}
            <span className={todayReturn > 0 ? 'text-red-400' : 'text-slate-600'}>
              {fmt(todayReturn)}원
            </span>
          </p>
        </div>

        <p className="text-center text-sm text-slate-400 scale-[0.85] origin-center">
          어제 순매출 ₩ {fmt(yesterdayNet)}
        </p>

        {syncedAt && (
          <p className="text-slate-600 text-[9px] text-right">
            POS 동기화 {new Date(syncedAt).toLocaleTimeString('ko-KR', { hour: '2-digit', minute: '2-digit' })}
          </p>
        )}
      </div>
    </WidgetWrapper>
  );
}

export default function TodaySalesWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  if (!storeId) {
    return (
      <WidgetWrapper title="📊 당일 매출 현황" editMode={editMode} onRemove={onRemove}>
        <div className="p-3"><EmptyState reason="매장이 선택되지 않았습니다. 상단에서 매장을 선택해 주세요." /></div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetAsyncBoundary skeleton="widget" widgetName="당일 매출">
      <TodaySalesContent editMode={editMode} onRemove={onRemove} storeId={storeId} />
    </WidgetAsyncBoundary>
  );
}
