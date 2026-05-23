'use client';

import { useState, useEffect, useCallback } from 'react';
import { Droplets } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';

interface WeatherData {
  condition: string; icon: string; temp: number;
  tempMax: number; tempMin: number; precipProb: number; regionSido: string;
}

export default function WeatherWidget({
  editMode, onRemove, storeId,
}: {
  editMode: boolean; onRemove: () => void; storeId?: string;
}) {
  const [data,      setData]      = useState<WeatherData | null>(null);
  const [loading,   setLoading]   = useState(true);
  const [error,     setError]     = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const q   = storeId ? `?storeId=${storeId}` : '';
      const res = await fetch(`/api/dashboard/weather${q}`);
      const d   = await res.json();
      if (d.error) throw new Error(d.error);
      setData(d);
      setUpdatedAt(new Date());
    } catch {
      setError('날씨 조회 실패');
    } finally {
      setLoading(false);
    }
  }, [storeId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <WidgetWrapper
      title="🌤️ 오늘 날씨"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="flex flex-col items-center justify-center h-full p-3 gap-1">
          <p className="text-slate-500 text-[10px]">{data.regionSido}</p>
          <div className="text-4xl">{data.icon}</div>
          <div className="text-3xl font-bold text-slate-100">{data.temp}°</div>
          <p className="text-slate-400 text-xs">{data.condition}</p>
          <div className="flex items-center gap-3 mt-1 text-xs">
            <span className="text-blue-400">↓{data.tempMin}°</span>
            <span className="text-red-400">↑{data.tempMax}°</span>
          </div>
          {data.precipProb > 0 && (
            <div className="flex items-center gap-1 text-slate-500 text-[10px] mt-0.5">
              <Droplets className="w-3 h-3 text-blue-400" />
              <span>강수 {data.precipProb}%</span>
            </div>
          )}
        </div>
      )}
    </WidgetWrapper>
  );
}
