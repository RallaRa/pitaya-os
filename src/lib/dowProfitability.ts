import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import {
  fetchDailyReportsInRange,
  fetchPosDailySalesInRange,
  fetchPosSalesHeaderSince,
} from '@/lib/dashboardSalesData';
import { getDisplayNetSales, type SalesDocData } from '@/lib/posDailySales';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { netSalesFromDailyReport } from '@/lib/reportCompare';
import {
  aggregateByDow,
  DOW_PERIOD_DAYS,
  estimateProfit,
  generateDowInsights,
  rankDowRows,
  type DowPeriod,
  type DowProfitDetail,
  type DowProfitResult,
} from '@/lib/dowProfitabilityCalc';

interface DailyMetric {
  date: string;
  dow: number;
  netSales: number;
  customers: number;
  profit: number;
  estCost: number;
  isEstimated: boolean;
}

function getDow(date: string): number {
  return new Date(`${date.slice(0, 10)}T12:00:00+09:00`).getDay();
}

async function fetchDailyMetrics(
  storeId: string,
  startDate: string,
  endDate: string,
): Promise<DailyMetric[]> {
  const byDate = new Map<string, { netSales: number; customers: number; profitPri?: number }>();

  const [drSnap, posSnap] = await Promise.all([
    fetchDailyReportsInRange(storeId, startDate, endDate),
    fetchPosDailySalesInRange(storeId, startDate, endDate),
  ]);

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
      const net = getDisplayNetSales(row as SalesDocData)
        || Number(row.netSales ?? row.netSale ?? netSalesFromDailyReport(row) ?? 0);
      const customers = Number(row.customerCount ?? row.transCount ?? 0);
      if (net > 0) byDate.set(date, { netSales: net, customers });
    }
  }

  if (posSnap && !posSnap.empty) {
    for (const doc of posSnap.docs) {
      const d = doc.data();
      const date = String(d.date || '').slice(0, 10);
      if (!date || byDate.has(date)) continue;
      const net = getDisplayNetSales(d as SalesDocData);
      const customers = Number(d.customerCount ?? d.transCount ?? 0);
      if (net > 0) byDate.set(date, { netSales: net, customers });
    }
  }

  const sinceCompact = startDate.replace(/-/g, '');
  const headerSnap = await fetchPosSalesHeaderSince(storeId, sinceCompact, 120);
  if (headerSnap && !headerSnap.empty) {
    for (const doc of headerSnap.docs) {
      const d = doc.data();
      const rawDate = String(d.date || '');
      const date = rawDate.length === 8
        ? `${rawDate.slice(0, 4)}-${rawDate.slice(4, 6)}-${rawDate.slice(6, 8)}`
        : rawDate.slice(0, 10);
      if (date < startDate || date > endDate) continue;
      const entry = byDate.get(date);
      if (entry) {
        entry.profitPri = Number(d.profitPri ?? 0);
      }
    }
  }

  const metrics: DailyMetric[] = [];
  for (const [date, row] of byDate) {
    const { profit, estCost, isEstimated } = estimateProfit(row.netSales, row.profitPri);
    metrics.push({
      date,
      dow: getDow(date),
      netSales: row.netSales,
      customers: row.customers,
      profit,
      estCost,
      isEstimated,
    });
  }

  return metrics.sort((a, b) => a.date.localeCompare(b.date));
}

export async function computeDowProfitability(
  storeId: string,
  period: DowPeriod = 'month',
): Promise<DowProfitResult> {
  const endDate = getKSTTodayYMD();
  const startDate = addDaysYMD(endDate, -(DOW_PERIOD_DAYS[period] - 1));
  const days = await fetchDailyMetrics(storeId, startDate, endDate);
  const aggregated = aggregateByDow(days);
  const rows = rankDowRows(aggregated);
  const insights = generateDowInsights(rows);

  return {
    period,
    startDate,
    endDate,
    rows,
    insights,
    daysProcessed: days.length,
  };
}

export async function computeDowProfitDetail(
  storeId: string,
  period: DowPeriod,
  dow: number,
): Promise<DowProfitDetail | null> {
  const result = await computeDowProfitability(storeId, period);
  const row = result.rows.find(r => r.dow === dow);
  if (!row) return null;

  const endDate = getKSTTodayYMD();
  const startDate = addDaysYMD(endDate, -(DOW_PERIOD_DAYS[period] - 1));
  const days = await fetchDailyMetrics(storeId, startDate, endDate);
  const dates = days
    .filter(d => d.dow === dow)
    .map(d => ({
      date: d.date,
      netSales: d.netSales,
      customers: d.customers,
      profit: d.profit,
      estCost: d.estCost,
    }))
    .sort((a, b) => b.netSales - a.netSales);

  return { ...row, dates };
}
