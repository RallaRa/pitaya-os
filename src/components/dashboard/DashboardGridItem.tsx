'use client';

import { useRef, useEffect } from 'react';

/** page.tsx ResponsiveGridLayout 과 동일 */
export const DASHBOARD_ROW_HEIGHT = 80;
export const DASHBOARD_GRID_MARGIN_Y = 16;

function pixelHeightToGridRows(pixelHeight: number, minH: number): number {
  const unit = DASHBOARD_ROW_HEIGHT + DASHBOARD_GRID_MARGIN_Y;
  return Math.max(minH, Math.ceil((pixelHeight + DASHBOARD_GRID_MARGIN_Y) / unit));
}

interface Props {
  id: string;
  /** 내용 높이에 맞춰 그리드 h 갱신 (AI 예측 등) */
  autoMeasure?: boolean;
  minH?: number;
  onHeight?: (id: string, h: number) => void;
  children: React.ReactNode;
}

/**
 * react-grid-layout 셀 안에서 자식이 넘치지 않도록 감싸고,
 * autoMeasure 시 실제 콘텐츠 높이를 보고 부모 그리드 row(h)를 맞춤.
 */
export default function DashboardGridItem({
  id,
  autoMeasure = false,
  minH = 3,
  onHeight,
  children,
}: Props) {
  const measureRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!autoMeasure || !onHeight || !measureRef.current) return;

    const el = measureRef.current;
    let debounce: ReturnType<typeof setTimeout> | null = null;

    const report = () => {
      const h = pixelHeightToGridRows(el.scrollHeight, minH);
      onHeight(id, h);
    };

    const schedule = () => {
      if (debounce) clearTimeout(debounce);
      debounce = setTimeout(report, 120);
    };

    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    return () => {
      ro.disconnect();
      if (debounce) clearTimeout(debounce);
    };
  }, [id, autoMeasure, minH, onHeight]);

  if (autoMeasure) {
    return (
      <div className="min-h-0 w-full">
        <div ref={measureRef} className="w-full">
          {children}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full min-h-0 w-full overflow-hidden flex flex-col">
      {children}
    </div>
  );
}
