import { DOW_KO } from '@/lib/dateUtils';

export type HeatmapRange = '1m' | '3m' | '6m';
export type HeatmapLevel = 'high' | 'mid' | 'low';

export interface HeatmapCell {
  dow: number;
  hour: number;
  avgSales: number;
  totalSales: number;
  dayCount: number;
  tranCount: number;
  level: HeatmapLevel;
}

export interface HeatmapInsight {
  text: string;
  dow: number;
  hourFrom: number;
  hourTo: number;
  pctVsWeek: number;
}

export interface HeatmapResult {
  range: HeatmapRange;
  startDate: string;
  endDate: string;
  cells: HeatmapCell[][];
  maxAvg: number;
  insights: HeatmapInsight[];
  daysProcessed: number;
}

export interface HeatmapCellDetail {
  dow: number;
  hour: number;
  dowLabel: string;
  avgSales: number;
  totalSales: number;
  dayCount: number;
  tranCount: number;
  vsHourAvgPct: number;
  vsOverallAvgPct: number;
  peakDates: Array<{ date: string; sales: number }>;
}

export const RANGE_DAYS: Record<HeatmapRange, number> = {
  '1m': 30,
  '3m': 90,
  '6m': 180,
};

export function parseSlotHour(raw: string | number | undefined): number | null {
  if (raw == null || raw === '') return null;
  const h = parseInt(String(raw).replace(/:.*/, ''), 10);
  if (Number.isNaN(h) || h < 0 || h > 23) return null;
  return h;
}

export function assignHeatmapLevels(flat: HeatmapCell[]): void {
  const values = flat.map(c => c.avgSales).filter(v => v > 0).sort((a, b) => a - b);
  if (values.length === 0) return;

  const p33 = values[Math.floor(values.length * 0.33)] ?? 0;
  const p66 = values[Math.floor(values.length * 0.66)] ?? 0;

  for (const cell of flat) {
    if (cell.avgSales <= 0) {
      cell.level = 'low';
    } else if (cell.avgSales >= p66) {
      cell.level = 'high';
    } else if (cell.avgSales >= p33) {
      cell.level = 'mid';
    } else {
      cell.level = 'low';
    }
  }
}

export function levelColorClass(level: HeatmapLevel): string {
  switch (level) {
    case 'high': return 'bg-teal-400/85 hover:bg-teal-400';
    case 'mid': return 'bg-slate-600 hover:bg-slate-500';
    default: return 'bg-slate-800 hover:bg-slate-700';
  }
}

export function generateHeatmapInsights(matrix: HeatmapCell[][]): HeatmapInsight[] {
  const candidates: HeatmapInsight[] = [];

  for (let dow = 0; dow < 7; dow++) {
    for (let h = 0; h <= 21; h++) {
      const c1 = matrix[dow][h];
      const c2 = matrix[dow][h + 1];
      const slotSum = (c1?.avgSales || 0) + (c2?.avgSales || 0);
      if (slotSum <= 0) continue;

      let weekSum = 0;
      let weekCount = 0;
      for (let d = 0; d < 7; d++) {
        weekSum += (matrix[d][h]?.avgSales || 0) + (matrix[d][h + 1]?.avgSales || 0);
        weekCount += 1;
      }
      const weekAvg = weekCount > 0 ? weekSum / weekCount : 0;
      if (weekAvg <= 0) continue;

      const pct = Math.round(((slotSum / weekAvg) - 1) * 100);
      if (pct >= 30) {
        candidates.push({
          text: `${DOW_KO[dow]}요일 ${h}~${h + 2}시 주간 평균 대비 ${pct}% 높음`,
          dow,
          hourFrom: h,
          hourTo: h + 2,
          pctVsWeek: pct,
        });
      }
    }
  }

  return candidates
    .sort((a, b) => b.pctVsWeek - a.pctVsWeek)
    .slice(0, 5);
}

export function formatManwon(n: number): string {
  const m = n / 10_000;
  return m >= 10 ? `${Math.round(m)}만원` : `${m.toFixed(1)}만원`;
}
