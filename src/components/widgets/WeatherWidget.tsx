'use client';

import { useCallback, useEffect, useState } from 'react';
import { Droplets } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import WidgetAsyncBoundary from '@/components/suspense/WidgetAsyncBoundary';
import EmptyState from '@/components/suspense/EmptyState';
import { fetchAuthJson } from '@/components/suspense/fetchJson';
import { useSuspenseInvalidate, useSuspenseResource } from '@/components/suspense/useSuspenseResource';

const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

interface DayWeather {
  date: string;
  condition: string;
  icon: string;
  tempMax: number;
  tempMin: number;
  precipProb: number;
}

interface WeatherData {
  regionSido: string;
  currentTemp: number;
  days: DayWeather[];
}

function DayCard({ day, isYesterday, isToday, currentTemp }: {
  day: DayWeather;
  isYesterday: boolean;
  isToday: boolean;
  currentTemp: number;
}) {
  const d = new Date(day.date + 'T00:00:00');
  const month = d.getMonth() + 1;
  const date = d.getDate();
  const dow = DOW_KO[d.getDay()];
  const isSat = d.getDay() === 6;
  const isSun = d.getDay() === 0;
  const dowColor = isSat ? 'text-blue-400' : isSun ? 'text-red-400' : 'text-slate-400';
  const borderCls = isToday
    ? 'border border-teal-500/40 bg-teal-500/5'
    : 'border border-slate-700/50 bg-slate-800/30';

  return (
    <div className={`flex flex-col items-center gap-1 px-2 py-2 rounded-xl min-w-[64px] flex-1 ${borderCls}`}>
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
      <span className="text-xl leading-none">{day.icon}</span>
      {isToday && (
        <span className="text-base font-bold text-slate-100 leading-none">{currentTemp}°</span>
      )}
      <div className="flex items-center gap-1 text-[10px]">
        <span className="text-red-400">↑{day.tempMax}°</span>
        <span className="text-blue-400">↓{day.tempMin}°</span>
      </div>
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

function cacheKey(storeId: string) {
  return `dashboard:weather:${storeId}`;
}

function WeatherContent({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId: string }) {
  const key = cacheKey(storeId);
  const invalidate = useSuspenseInvalidate(key);
  const data = useSuspenseResource(key, () =>
    fetchAuthJson<WeatherData>(`/api/dashboard/weather?storeId=${encodeURIComponent(storeId)}`),
  );
  const [updatedAt, setUpdatedAt] = useState(() => new Date());

  useEffect(() => {
    setUpdatedAt(new Date());
  }, [data]);

  const refresh = useCallback(() => invalidate(), [invalidate]);

  useEffect(() => {
    const t = setInterval(refresh, 60 * 60 * 1000);
    return () => clearInterval(t);
  }, [refresh]);

  const todayStr = new Date().toISOString().split('T')[0];
  const yesterdayStr = new Date(Date.now() - 86400000).toISOString().split('T')[0];

  return (
    <WidgetWrapper
      title="🌤️ 날씨 예보"
      editMode={editMode}
      onRemove={onRemove}
      onRefresh={refresh}
      updatedAt={updatedAt}
    >
      {!data.days?.length ? (
        <EmptyState reason="날씨 데이터가 없습니다." compact />
      ) : (
        <div className="flex flex-col h-full px-2 py-1 gap-1">
          <p className="text-[10px] text-slate-500 text-center">{data.regionSido}</p>
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

export default function WeatherWidget({
  editMode, onRemove, storeId,
}: { editMode: boolean; onRemove: () => void; storeId?: string }) {
  if (!storeId) {
    return (
      <WidgetWrapper title="🌤️ 날씨 예보" editMode={editMode} onRemove={onRemove}>
        <div className="p-3"><EmptyState reason="매장이 선택되지 않았습니다." compact /></div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetAsyncBoundary skeleton="chart" widgetName="날씨">
      <WeatherContent editMode={editMode} onRemove={onRemove} storeId={storeId} />
    </WidgetAsyncBoundary>
  );
}
