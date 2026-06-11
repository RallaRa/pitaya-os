import { DOW_KO } from '@/lib/dateUtils';

export type DowPeriod = 'week' | 'month' | 'quarter';

export const DOW_PERIOD_DAYS: Record<DowPeriod, number> = {
  week: 7,
  month: 30,
  quarter: 90,
};

export const DOW_PERIOD_LABELS: Record<DowPeriod, string> = {
  week: '주간',
  month: '월간',
  quarter: '분기',
};

export interface DowProfitRow {
  dow: number;
  dowLabel: string;
  rank: number;
  avgSales: number;
  avgCustomers: number;
  avgTicket: number;
  avgEstCost: number;
  avgEstProfit: number;
  profitMargin: number;
  dayCount: number;
  profitIsEstimated: boolean;
}

export interface DowProfitInsight {
  type: 'low' | 'high';
  text: string;
  dow: number;
}

export interface DowProfitResult {
  period: DowPeriod;
  startDate: string;
  endDate: string;
  rows: DowProfitRow[];
  insights: DowProfitInsight[];
  daysProcessed: number;
}

export interface DowProfitDetail extends DowProfitRow {
  dates: Array<{
    date: string;
    netSales: number;
    customers: number;
    profit: number;
    estCost: number;
  }>;
}

const DEFAULT_COST_RATIO = 0.65;

export function estimateProfit(netSales: number, profitPri?: number | null): {
  profit: number;
  estCost: number;
  isEstimated: boolean;
} {
  if (profitPri != null && profitPri > 0 && netSales > 0) {
    const profit = Math.round(profitPri);
    return { profit, estCost: Math.max(0, netSales - profit), isEstimated: false };
  }
  const estCost = Math.round(netSales * DEFAULT_COST_RATIO);
  const profit = Math.max(0, netSales - estCost);
  return { profit, estCost, isEstimated: true };
}

export function aggregateByDow(
  days: Array<{
    date: string;
    dow: number;
    netSales: number;
    customers: number;
    profit: number;
    estCost: number;
    isEstimated: boolean;
  }>,
): Omit<DowProfitRow, 'rank'>[] {
  const buckets = Array.from({ length: 7 }, (_, dow) => ({
    dow,
    dowLabel: DOW_KO[dow],
    salesSum: 0,
    custSum: 0,
    profitSum: 0,
    costSum: 0,
    dayCount: 0,
    estimatedDays: 0,
  }));

  for (const d of days) {
    if (d.netSales <= 0) continue;
    const b = buckets[d.dow];
    b.salesSum += d.netSales;
    b.custSum += d.customers;
    b.profitSum += d.profit;
    b.costSum += d.estCost;
    b.dayCount += 1;
    if (d.isEstimated) b.estimatedDays += 1;
  }

  return buckets
    .filter(b => b.dayCount > 0)
    .map(b => {
      const avgSales = Math.round(b.salesSum / b.dayCount);
      const avgCustomers = Math.round(b.custSum / b.dayCount);
      const avgEstProfit = Math.round(b.profitSum / b.dayCount);
      const avgEstCost = Math.round(b.costSum / b.dayCount);
      const avgTicket = avgCustomers > 0 ? Math.round(avgSales / avgCustomers) : 0;
      const profitMargin = avgSales > 0 ? Math.round((avgEstProfit / avgSales) * 1000) / 10 : 0;
      return {
        dow: b.dow,
        dowLabel: b.dowLabel,
        avgSales,
        avgCustomers,
        avgTicket,
        avgEstCost,
        avgEstProfit,
        profitMargin,
        dayCount: b.dayCount,
        profitIsEstimated: b.estimatedDays > b.dayCount / 2,
      };
    });
}

export function rankDowRows(rows: Omit<DowProfitRow, 'rank'>[]): DowProfitRow[] {
  const sorted = [...rows].sort((a, b) => b.avgEstProfit - a.avgEstProfit);
  return sorted.map((r, i) => ({ ...r, rank: i + 1 }));
}

export function generateDowInsights(rows: DowProfitRow[]): DowProfitInsight[] {
  if (rows.length < 2) return [];
  const sorted = [...rows].sort((a, b) => a.rank - b.rank);
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const insights: DowProfitInsight[] = [];

  if (worst) {
    insights.push({
      type: 'low',
      dow: worst.dow,
      text: `${worst.dowLabel}요일이 가장 수익성 낮음 → 프로모션 또는 운영 축소 검토`,
    });
  }
  if (best && best.dow !== worst?.dow) {
    insights.push({
      type: 'high',
      dow: best.dow,
      text: `${best.dowLabel}요일이 가장 수익성 높음 → 고마진 품목·피크 시간 집중 권장`,
    });
  }
  return insights;
}

export function formatManwon(n: number): string {
  const m = n / 10_000;
  return m >= 10 ? `${Math.round(m)}만` : `${m.toFixed(1)}만`;
}
