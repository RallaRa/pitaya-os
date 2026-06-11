'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import {
  WidgetAsyncBoundary,
  EmptyState,
  fetchAuthJson,
  useSuspenseResource,
  useSuspenseInvalidate,
} from '@/components/suspense';

interface Item { name: string; qty: number; amount: number; }
interface YesterdayData { dateLabel: string; top: Item[]; bottom: Item[]; noData?: boolean; emptyReason?: string; ai?: AiMetaDisplay; }

function cacheKey(storeId: string) {
  return `dashboard:yesterday-analysis:${storeId}`;
}

function YesterdayWidgetContent({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId: string;
}) {
  const key = cacheKey(storeId);
  const invalidate = useSuspenseInvalidate(key);
  const data = useSuspenseResource(key, async () => {
    const params = new URLSearchParams();
    params.set('storeId', storeId);
    const d = await fetchAuthJson<YesterdayData & { error?: string }>(
      `/api/dashboard/yesterday-analysis?${params}`,
    );
    if (d.error) throw new Error(d.error);
    return d;
  });
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [data]);

  const refresh = useCallback(() => {
    invalidate();
  }, [invalidate]);

  useEffect(() => {
    timerRef.current = setInterval(refresh, 30 * 1000);

    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [refresh]);

  const RANK_COLOR = ['text-yellow-400', 'text-slate-300', 'text-orange-400', 'text-slate-400', 'text-slate-500'];

  return (
    <WidgetWrapper
      title="📅 전일 판매 분석"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      {data && (
        <div className="h-full overflow-y-auto p-3 space-y-3">
          {data.dateLabel && (
            <p className="text-slate-500 text-[10px] font-semibold">{data.dateLabel} 판매 현황</p>
          )}

          {data.noData ? (
            <EmptyState
              reason={data.emptyReason || '전일 판매 데이터가 없습니다.'}
              hints={['daily_reports에 items 배열 필요', 'POS 브릿지·일마감 입력 확인']}
            />
          ) : (
            <>
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
                        <span className="text-slate-500 text-[10px] shrink-0">{item.amount ? `${item.amount.toLocaleString()}원` : ''}</span>
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
            </>
          )}
          <AiUsedBadge ai={data.ai} className="pt-2 border-t border-slate-800/60" />
        </div>
      )}
    </WidgetWrapper>
  );
}

export default function YesterdayWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  if (!storeId) {
    return (
      <WidgetWrapper title="📅 전일 판매 분석" editMode={editMode} onRemove={onRemove}>
        <div className="p-3">
          <EmptyState reason="매장이 선택되지 않았습니다." />
        </div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetAsyncBoundary skeleton="table" widgetName="전일 판매 분석">
      <YesterdayWidgetContent editMode={editMode} onRemove={onRemove} storeId={storeId} />
    </WidgetAsyncBoundary>
  );
}
