'use client';

import { useState, useRef, useCallback } from 'react';

interface Props {
  selected: string[];
  onChange: (dates: string[]) => void;
  className?: string;
}

function toYMD(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function datesBetween(a: string, b: string): string[] {
  const start = a < b ? a : b;
  const end = a < b ? b : a;
  const out: string[] = [];
  const cur = new Date(`${start}T12:00:00`);
  const endD = new Date(`${end}T12:00:00`);
  while (cur <= endD) {
    out.push(toYMD(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

const DOW = ['일', '월', '화', '수', '목', '금', '토'];

export default function DateRangePicker({ selected, onChange, className = '' }: Props) {
  const [cursor, setCursor] = useState(() => {
    const d = selected[0] ? new Date(`${selected[0]}T12:00:00`) : new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const dragging = useRef(false);
  const anchor = useRef<string | null>(null);

  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(`${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`);
  }

  const handleDown = (date: string) => {
    dragging.current = true;
    anchor.current = date;
    onChange([date]);
  };

  const handleEnter = (date: string) => {
    if (!dragging.current || !anchor.current) return;
    onChange(datesBetween(anchor.current, date));
  };

  const endDrag = useCallback(() => {
    dragging.current = false;
  }, []);

  return (
    <div className={className} onMouseUp={endDrag} onMouseLeave={endDrag} onTouchEnd={endDrag}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-slate-300">{year}년 {month + 1}월</span>
        <div className="flex gap-1">
          <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} className="text-slate-500 hover:text-slate-300 px-2">◀</button>
          <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))} className="text-slate-500 hover:text-slate-300 px-2">▶</button>
        </div>
      </div>
      <div className="grid grid-cols-7 gap-0.5 mb-1">
        {DOW.map((d, i) => (
          <div key={d} className={`text-center text-[10px] font-semibold ${i === 0 ? 'text-red-400' : i === 6 ? 'text-blue-400' : 'text-slate-600'}`}>{d}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-0.5 select-none">
        {cells.map((date, idx) => {
          if (!date) return <div key={`e-${idx}`} className="h-8" />;
          const sel = selected.includes(date);
          const day = parseInt(date.slice(-2), 10);
          return (
            <button
              key={date}
              type="button"
              data-date={date}
              onMouseDown={() => handleDown(date)}
              onMouseEnter={() => handleEnter(date)}
              onTouchStart={() => handleDown(date)}
              onTouchMove={e => {
                const t = e.touches[0];
                const el = document.elementFromPoint(t.clientX, t.clientY);
                const ds = el?.getAttribute('data-date');
                if (ds) handleEnter(ds);
              }}
              className={`h-8 rounded text-xs font-medium transition-colors ${
                sel ? 'bg-blue-600 text-white' : 'text-slate-400 hover:bg-slate-800'
              }`}
            >
              {day}
            </button>
          );
        })}
      </div>
      {selected.length > 0 && (
        <p className="text-[10px] text-slate-500 mt-2">{selected.length}일 선택됨 — 드래그로 범위 선택</p>
      )}
    </div>
  );
}
