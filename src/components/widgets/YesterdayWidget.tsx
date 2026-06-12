'use client';

import { useState, useEffect, useCallback } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import EmptyState from '@/components/suspense/EmptyState';
import SkeletonTable from '@/components/suspense/SkeletonTable';
import { useYesterdayAnalysis } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

interface Item { name: string; qty: number; amount: number; }
interface YesterdayData { dateLabel: string; top: Item[]; bottom: Item[]; noData?: boolean; emptyReason?: string; ai?: AiMetaDisplay; }

function YesterdayWidgetContent({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId: string;
}) {
  const { data, isLoading, isError, refetch, dataUpdatedAt } = useYesterdayAnalysis(storeId);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(new Date());

  useEffect(() => {
    if (dataUpdatedAt) setUpdatedAt(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const analysis = useWidgetAnalysis('yesterday_analysis', storeId, data);

  if (isLoading && !data) {
    return (
      <WidgetWrapper title="📅 전일 판매 분석" editMode={editMode} onRemove={onRemove}>
        <SkeletonTable />
      </WidgetWrapper>
    );
  }

  if (isError || !data) {
    return (
      <WidgetWrapper title="📅 전일 판매 분석" editMode={editMode} onRemove={onRemove} onRefresh={refresh}>
        <div className="p-3"><EmptyState reason="전일 판매 데이터를 불러오지 못했습니다." /></div>
      </WidgetWrapper>
    );
  }

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
          <AiUsedBadge ai={data.ai as AiMetaDisplay | undefined} className="pt-2 border-t border-slate-800/60" />
          <WidgetAnalysisPanel analysis={analysis} />
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

  return <YesterdayWidgetContent editMode={editMode} onRemove={onRemove} storeId={storeId} />;
}
