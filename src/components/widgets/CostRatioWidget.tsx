'use client';

import { useState, useEffect, useCallback } from 'react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

interface Offender {
  name: string;
  actualRatio: number;
  targetRatio: number;
}

export default function CostRatioWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  const [avg, setAvg] = useState<number | null>(null);
  const [offenders, setOffenders] = useState<Offender[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async () => {
    if (!storeId) { setLoading(false); return; }
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/dashboard/cost-ratio?storeId=${encodeURIComponent(storeId)}`, { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '조회 실패');
      setAvg(data.storeAvgRatio ?? null);
      setOffenders(data.offenders || []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : '조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <WidgetWrapper title="원가율 모니터" editMode={editMode} onRemove={onRemove} onRefresh={fetchData} loading={loading} error={error}>
      <div className="p-4 space-y-3">
        <div className="flex items-baseline gap-2">
          <span className="text-2xl font-bold text-teal-400">{avg != null ? pct(avg) : '—'}</span>
          <span className="text-slate-500 text-xs">매장 평균 원가율</span>
        </div>
        {offenders.length > 0 ? (
          <ul className="space-y-1.5">
            {offenders.slice(0, 5).map(o => (
              <li key={o.name} className="flex justify-between text-xs">
                <span className="text-slate-300 truncate mr-2">{o.name}</span>
                <span className="text-red-400 shrink-0">{pct(o.actualRatio)} / 목표 {pct(o.targetRatio)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-slate-600 text-xs">목표 초과 품목 없음</p>
        )}
      </div>
    </WidgetWrapper>
  );
}
