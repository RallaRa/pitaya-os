'use client';

import WidgetWrapper from './WidgetWrapper';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { useTimeSlotAov } from '@/lib/queries';
import type { TimeSlotAovRow } from '@/lib/pos/timeSlotAov';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';

export default function TimeSlotAovWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const date = getKSTTodayYMD();
  const { data, isLoading, isError, refetch, error } = useTimeSlotAov(storeId || '', date, !!storeId);
  const slots = (data?.slots || []) as TimeSlotAovRow[];
  const insight = data?.insight || null;
  const maxTicket = Math.max(...slots.map(s => s.avgTicket || 0), 1);
  const analysis = useWidgetAnalysis('time_slot_aov', storeId || undefined, data ? { slots, insight } : undefined);

  return (
    <WidgetWrapper
      title="시간대별 객단가"
      editMode={editMode}
      onRemove={onRemove}
      loading={isLoading}
      error={isError ? (error instanceof Error ? error.message : '조회 실패') : null}
      onRefresh={() => void refetch()}
    >
      {slots.length === 0 ? (
        <p className="text-slate-500 text-xs">POS 시간대 데이터 없음</p>
      ) : (
        <div className="space-y-2">
          {slots.map(slot => (
            <div key={slot.key}>
              <div className="flex justify-between text-xs mb-1">
                <span className="text-slate-300">{slot.label} <span className="text-slate-500">{slot.hourRange}</span></span>
                <span className="text-teal-400">{slot.avgTicket != null ? `${slot.avgTicket.toLocaleString()}원` : '-'}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div className="h-full bg-teal-500/70 rounded-full" style={{ width: `${Math.round(((slot.avgTicket || 0) / maxTicket) * 100)}%` }} />
              </div>
            </div>
          ))}
          {insight && <p className="text-amber-400/90 text-xs pt-1 border-t border-slate-800">{insight}</p>}
          <WidgetAnalysisPanel analysis={analysis} />
        </div>
      )}
    </WidgetWrapper>
  );
}
