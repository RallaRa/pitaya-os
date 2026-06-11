'use client';

import { Fragment } from 'react';
import { DOW_KO } from '@/lib/dateUtils';
import {
  formatManwon,
  levelColorClass,
  type HeatmapCell,
  type HeatmapInsight,
} from '@/lib/salesHeatmapCalc';

interface Props {
  cells: HeatmapCell[][];
  compact?: boolean;
  onCellClick?: (dow: number, hour: number) => void;
  selected?: { dow: number; hour: number } | null;
}

export default function SalesHeatmapGrid({
  cells,
  compact = false,
  onCellClick,
  selected,
}: Props) {
  const hours = compact
    ? Array.from({ length: 12 }, (_, i) => i * 2)
    : Array.from({ length: 24 }, (_, i) => i);

  const getCellValue = (dow: number, hour: number): HeatmapCell | null => {
    if (!compact) return cells[dow]?.[hour] ?? null;
    const c1 = cells[dow]?.[hour] ?? null;
    const c2 = cells[dow]?.[hour + 1] ?? null;
    const avg = ((c1?.avgSales || 0) + (c2?.avgSales || 0)) / (c1 || c2 ? (c1 && c2 ? 2 : 1) : 1);
    const level = c1?.level === 'high' || c2?.level === 'high'
      ? 'high'
      : c1?.level === 'mid' || c2?.level === 'mid'
        ? 'mid'
        : 'low';
    return {
      dow,
      hour,
      avgSales: Math.round(avg),
      totalSales: (c1?.totalSales || 0) + (c2?.totalSales || 0),
      dayCount: Math.max(c1?.dayCount || 0, c2?.dayCount || 0),
      tranCount: (c1?.tranCount || 0) + (c2?.tranCount || 0),
      level,
    };
  };

  return (
    <div className="overflow-x-auto">
      <div className="min-w-[640px]">
        <div
          className="grid gap-0.5"
          style={{ gridTemplateColumns: `48px repeat(${hours.length}, minmax(0, 1fr))` }}
        >
          <div />
          {hours.map(h => (
            <div key={h} className="text-[9px] text-slate-500 text-center pb-1">
              {compact ? `${h}` : `${h}`}
            </div>
          ))}

          {DOW_KO.map((label, dow) => (
            <Fragment key={dow}>
              <div className="text-[10px] text-slate-400 flex items-center pr-1">
                {label}
              </div>
              {hours.map(h => {
                const cell = getCellValue(dow, h);
                const isSelected = selected?.dow === dow && selected?.hour === h;
                return (
                  <button
                    key={`${dow}-${h}`}
                    type="button"
                    title={cell?.avgSales ? `${label} ${h}시 · ${formatManwon(cell.avgSales)}` : `${label} ${h}시`}
                    onClick={() => onCellClick?.(dow, h)}
                    className={[
                      'aspect-square rounded-sm transition-all min-h-[18px]',
                      levelColorClass(cell?.level || 'low'),
                      isSelected ? 'ring-2 ring-teal-300 ring-offset-1 ring-offset-slate-950' : '',
                      onCellClick ? 'cursor-pointer' : 'cursor-default',
                    ].join(' ')}
                  />
                );
              })}
            </Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}

export function HeatmapInsightsList({ insights }: { insights: HeatmapInsight[] }) {
  if (!insights.length) {
    return <p className="text-xs text-slate-500">뚜렷한 피크 패턴이 없습니다.</p>;
  }
  return (
    <ul className="space-y-1.5">
      {insights.map((ins, i) => (
        <li key={i} className="text-xs text-teal-300/90 bg-teal-950/30 border border-teal-900/30 rounded-lg px-3 py-2">
          💡 {ins.text}
        </li>
      ))}
    </ul>
  );
}
