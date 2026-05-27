'use client';

import { useState, useEffect, useCallback } from 'react';
import { Droplets } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import { getAuthHeaders } from '@/lib/getAuthHeaders';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface DayWeather {
  date:       string;
  condition:  string;
  icon:       string;
  tempMax:    number;
  tempMin:    number;
  precipProb: number;
}

interface WeatherData {
  regionSido:  string;
  currentTemp: number;
  days:        DayWeather[];
}

function DayCard({ day, isYesterday, isToday, currentTemp }: {
  day: DayWeather;
  isYesterday: boolean;
  isToday:     boolean;
  currentTemp: number;
}) {
  const d        = new Date(day.date + 'T00:00:00');
  const month    = d.getMonth() + 1;
  const date     = d.getDate();
  const dow      = DOW_KO[d.getDay()];
  const isSat    = d.getDay() === 6;
  const isSun    = d.getDay() === 0;

  const dowColor = isSat ? 'text-blue-400' : isSun ? 'text-red-400' : 'text-slate-400';
  const borderCls = isToday
    ? 'border border-teal-500/40 bg-teal-500/5'
    : 'border border-slate-700/50 bg-slate-800/30';

  return (
    <div className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl min-w-[64px] flex-1 ${borderCls}`}>
      {/* 날짜 라벨 */}
      <div className="flex flex-col items-center leading-tight">
        {isToday ? (
          <span className="text-[10px] font-bold text-teal-400">오늘</span>
        ) : isYesterday ? (
          <span className="text-[10px] font-bold text-slate-500">어제</span>
        ) : (
          <span className="text-[10px] text-slate-500">{month}/{date}</span>
        )}
        <span className={`text-[11px] font-semibold ${dowColor}`}>{dow}</span>
      </div>

      {/* 날씨 아이콘 */}
      <span className="text-xl leading-none">{day.icon}</span>

      {/* 오늘: 현재기온 강조 */}
      {isToday && (
        <span className="text-base font-bold text-slate-100 leading-none">{currentTemp}°</span>
      )}

      {/* 최고/최저 */}
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-red-400">↑{day.tempMax}°</span>
        <span className="text-blue-400">↓{day.tempMin}°</span>
      </div>

      {/* 강수확률 */}
      {day.precipProb > 0 ? (
        <div className="flex items-center gap-0.5 text-[10px] text-blue-400">
          <Droplets className="w-2.5 h-2.5" />
          <span>{day.precipProb}%</span>
        </div>
      ) : (
        <div className="h-4" />
      )}
    </div>
  );
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
      const res = await fetch(`/api/dashboard/weather${q}`, { headers: await getAuthHeaders() });
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

  const todayStr     = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  return (
    <WidgetWrapper
      title="🌤️ 날씨 예보"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={load}
      updatedAt={updatedAt}
      loading={loading}
      error={error}
    >
      {data && (
        <div className="flex flex-col h-full px-2 py-1 gap-1">
          {/* 지역명 */}
          <p className="text-[10px] text-slate-500 text-center">{data.regionSido}</p>

          {/* 5일 카드 */}
          <div className="flex gap-1.5 flex-1 items-stretch overflow-x-auto scrollbar-none">
            {data.days.map(day => (
              <DayCard
                key={day.date}
                day={day}
                isToday={day.date === todayStr}
                isYesterday={day.date === yesterdayStr}
                currentTemp={data.currentTemp}
              />
            ))}
          </div>
        </div>
      )}
    </WidgetWrapper>
  );
}
