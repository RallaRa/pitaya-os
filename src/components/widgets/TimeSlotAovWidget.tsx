'use client';

import { useCallback, useEffect, useState } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import type { TimeSlotAovRow } from '@/lib/pos/timeSlotAov';

export default function TimeSlotAovWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const [slots, setSlots] = useState<TimeSlotAovRow[]>([]);
  const [insight, setInsight] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const date = getKSTTodayYMD();
      const res = await fetch(`/api/dashboard/time-slot-aov?storeId=${encodeURIComponent(storeId)}&date=${date}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setSlots(data.slots || []);
      setInsight(data.insight || null);
      setError(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { setLoading(true); fetchData(); const t = setInterval(fetchData, 60000); return () => clearInterval(t); }, [fetchData]);

  const maxTicket = Math.max(...slots.map(s => s.avgTicket || 0), 1);

  return (
    <WidgetWrapper title="시간대별 객단가" editMode={editMode} onRemove={onRemove} loading={loading} error={error} onRefresh={fetchData}>
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
        </div>
      )}
    </WidgetWrapper>
  );
}
