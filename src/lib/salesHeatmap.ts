import { addDaysYMD, DOW_KO, getKSTTodayYMD } from '@/lib/dateUtils';
import type { QuerySnapshot } from 'firebase-admin/firestore';
import {
  fetchDailyReportsInRange,
  fetchPosDailySalesInRange,
} from '@/lib/dashboardSalesData';
import { getDisplayNetSales, getDisplayTotalSale, type SalesDocData } from '@/lib/posDailySales';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { netSalesFromDailyReport } from '@/lib/reportCompare';
import {
  assignHeatmapLevels,
  generateHeatmapInsights,
  parseSlotHour,
  RANGE_DAYS,
  type HeatmapCell,
  type HeatmapCellDetail,
  type HeatmapRange,
  type HeatmapResult,
} from '@/lib/salesHeatmapCalc';

interface TimeSlotRow {
  hour?: string;
  totalSale?: number;
  tranCount?: number;
}

interface DayRow {
  date: string;
  timeSlots: TimeSlotRow[];
  netRatio: number;
}

type Accum = { sum: number; tran: number; dates: Set<string> };

function emptyMatrix(): Accum[][] {
  return Array.from({ length: 7 }, () =>
    Array.from({ length: 24 }, () => ({ sum: 0, tran: 0, dates: new Set<string>() })),
  );
}

function getDow(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00+09:00`).getDay();
}

function hourlySlotsFromItems(
  items: Array<{ time?: string; netSales?: number; amount?: number }>,
): TimeSlotRow[] {
  const byHour = new Map<number, { total: number; count: number }>();
  for (const it of items) {
    const h = parseSlotHour((it.time || '').split(':')[0]);
    if (h == null) continue;
    const amt = Number(it.netSales ?? it.amount ?? 0);
    if (amt <= 0) continue;
    const cur = byHour.get(h) || { total: 0, count: 0 };
    cur.total += amt;
    cur.count += 1;
    byHour.set(h, cur);
  }
  return [...byHour.entries()]
    .sort(([a], [b]) => a - b)
    .map(([hour, v]) => ({
      hour: String(hour),
      totalSale: v.total,
      tranCount: v.count,
    }));
}

function normalizeDayRows(
  storeId: string,
  drSnap: QuerySnapshot | null,
  posSnap: QuerySnapshot | null,
): DayRow[] {
  const byDate = new Map<string, DayRow>();

  if (drSnap && !drSnap.empty) {
    const reports = drSnap.docs.map(d => ({
      ...d.data(),
      reportDate: d.data().reportDate as string,
      storeId: d.data().storeId as string,
    }));
    for (const [, dr] of pickBestReportByDate(reports, storeId)) {
      const row = dr as Record<string, unknown> & { reportDate?: string };
      const date = String(row.reportDate || '').slice(0, 10);
      if (!date) continue;
      const total = Number(row.totalSales ?? 0);
      const net = Number(row.netSales ?? row.netSale ?? netSalesFromDailyReport(row) ?? 0);
      const ratio = total > 0 ? Math.min(1, net / total) : 1;
      let slots = (row.timeSlots as TimeSlotRow[]) || [];
      if (!slots.length && Array.isArray(row.items)) {
        slots = hourlySlotsFromItems(row.items as Array<{ time?: string; netSales?: number; amount?: number }>);
      }
      byDate.set(date, { date, timeSlots: slots, netRatio: ratio });
    }
  }

  if (posSnap && !posSnap.empty) {
    for (const doc of posSnap.docs) {
      const d = doc.data();
      const date = String(d.date || '').slice(0, 10);
      if (!date || byDate.has(date)) continue;
      const salesDoc = d as SalesDocData & { timeSlots?: TimeSlotRow[]; items?: unknown[] };
      const total = getDisplayTotalSale(salesDoc);
      const net = getDisplayNetSales(salesDoc);
      const ratio = total > 0 ? Math.min(1, net / total) : 1;
      let slots = salesDoc.timeSlots || [];
      if (!slots.length && Array.isArray(salesDoc.items)) {
        slots = hourlySlotsFromItems(salesDoc.items as Array<{ time?: string; netSales?: number; amount?: number }>);
      }
      if (slots.length) {
        byDate.set(date, { date, timeSlots: slots, netRatio: ratio });
      }
    }
  }

  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}

function buildMatrix(days: DayRow[]): { matrix: HeatmapCell[][]; peakByCell: Map<string, Array<{ date: string; sales: number }>> } {
  const accum = emptyMatrix();
  const peakByCell = new Map<string, Array<{ date: string; sales: number }>>();

  for (const day of days) {
    const dow = getDow(day.date);
    const seenHours = new Set<number>();

    for (const slot of day.timeSlots) {
      const hour = parseSlotHour(slot.hour);
      if (hour == null) continue;
      const raw = Number(slot.totalSale ?? 0);
      if (raw <= 0) continue;
      const sales = Math.round(raw * day.netRatio);
      accum[dow][hour].sum += sales;
      accum[dow][hour].tran += Number(slot.tranCount ?? 0);
      if (!seenHours.has(hour)) {
        accum[dow][hour].dates.add(day.date);
        seenHours.add(hour);
      }

      const key = `${dow}_${hour}`;
      const peaks = peakByCell.get(key) || [];
      peaks.push({ date: day.date, sales });
      peakByCell.set(key, peaks);
    }
  }

  const matrix: HeatmapCell[][] = [];
  for (let dow = 0; dow < 7; dow++) {
    const row: HeatmapCell[] = [];
    for (let hour = 0; hour < 24; hour++) {
      const a = accum[dow][hour];
      const dayCount = a.dates.size;
      row.push({
        dow,
        hour,
        totalSales: Math.round(a.sum),
        avgSales: dayCount > 0 ? Math.round(a.sum / dayCount) : 0,
        dayCount,
        tranCount: a.tran,
        level: 'low',
      });
    }
    matrix.push(row);
  }

  assignHeatmapLevels(matrix.flat());
  for (const peaks of peakByCell.values()) {
    peaks.sort((a, b) => b.sales - a.sales);
  }

  return { matrix, peakByCell };
}

export async function computeSalesHeatmap(
  storeId: string,
  range: HeatmapRange = '1m',
): Promise<HeatmapResult & { peakByCell: Map<string, Array<{ date: string; sales: number }>> }> {
  const endDate = getKSTTodayYMD();
  const startDate = addDaysYMD(endDate, -(RANGE_DAYS[range] - 1));

  const [drSnap, posSnap] = await Promise.all([
    fetchDailyReportsInRange(storeId, startDate, endDate),
    fetchPosDailySalesInRange(storeId, startDate, endDate),
  ]);

  const days = normalizeDayRows(storeId, drSnap, posSnap);
  const { matrix, peakByCell } = buildMatrix(days);
  const maxAvg = Math.max(0, ...matrix.flat().map(c => c.avgSales));
  const insights = generateHeatmapInsights(matrix);

  return {
    range,
    startDate,
    endDate,
    cells: matrix,
    maxAvg,
    insights,
    daysProcessed: days.length,
    peakByCell,
  };
}

export function buildCellDetail(
  result: HeatmapResult & { peakByCell: Map<string, Array<{ date: string; sales: number }>> },
  dow: number,
  hour: number,
): HeatmapCellDetail {
  const cell = result.cells[dow]?.[hour];
  const allHourAvgs: number[] = [];
  let overallSum = 0;
  let overallCount = 0;

  for (let d = 0; d < 7; d++) {
    for (let h = 0; h < 24; h++) {
      const c = result.cells[d][h];
      if (h === hour && c.avgSales > 0) allHourAvgs.push(c.avgSales);
      if (c.avgSales > 0) {
        overallSum += c.avgSales;
        overallCount += 1;
      }
    }
  }

  const hourAvg = allHourAvgs.length > 0
    ? allHourAvgs.reduce((s, v) => s + v, 0) / allHourAvgs.length
    : 0;
  const overallAvg = overallCount > 0 ? overallSum / overallCount : 0;
  const avg = cell?.avgSales || 0;

  return {
    dow,
    hour,
    dowLabel: DOW_KO[dow] || '',
    avgSales: avg,
    totalSales: cell?.totalSales || 0,
    dayCount: cell?.dayCount || 0,
    tranCount: cell?.tranCount || 0,
    vsHourAvgPct: hourAvg > 0 ? Math.round(((avg / hourAvg) - 1) * 100) : 0,
    vsOverallAvgPct: overallAvg > 0 ? Math.round(((avg / overallAvg) - 1) * 100) : 0,
    peakDates: (result.peakByCell.get(`${dow}_${hour}`) || []).slice(0, 5),
  };
}
