export type AnalysisPackId =
  | 'sales_operations'
  | 'sales_decline'
  | 'customer_retention'
  | 'item_mix';

export interface PeriodAgg {
  net: number;
  cust: number;
  days: number;
  ticket: number;
}

export interface ItemShiftRow {
  name: string;
  cat: string;
  prev: number;
  cur: number;
  pct: number | null;
  buyersPrev: number;
  buyersCur: number;
}

export interface SalesOperationsAnalysis {
  asOf: string;
  storeId: string;
  headline: {
    last7: PeriodAgg & { netWoW: number | null; custWoW: number | null; ticketWoW: number | null };
    prev7: PeriodAgg;
    last28: PeriodAgg & { netMoM: number | null; custMoM: number | null };
    prev28: PeriodAgg;
  };
  memberFlow: {
    last7: { visitors: number; visits: number; spend: number; ticket: number };
    prev7: { visitors: number; visits: number; spend: number; ticket: number };
    visitorWoW: number | null;
    visitWoW: number | null;
    spendPerVisitWoW: number | null;
    lostBuyersCount: number;
    lostTopItems: Array<{ name: string; amtPrev7: number }>;
  };
  customerHealth: {
    trends: Record<string, number>;
    trendLifetimeSpend: Record<string, number>;
    dormant: { d31_60: number; d61_180: number; d181plus: number; active30: number };
  };
  itemDeclines: ItemShiftRow[];
  itemGains: ItemShiftRow[];
  categoryMix: Array<{ cat: string; last7: number; prev7: number; pct: number | null }>;
  decreasingSegmentTopItems28d: Array<{ name: string; amt28d: number; buyers: number }>;
  weakDays: Array<{ dow: string; avgNet: number; avgCust: number; days: number }>;
  weeklyTrend: Array<{ week: string; net: number; cust: number; ticket: number }>;
}

export interface AnalysisPackResult {
  pack: AnalysisPackId;
  packLabel: string;
  focusHint: string;
  data: SalesOperationsAnalysis;
  promptAppendix: string;
  summary: {
    netWoW: number | null;
    custWoW: number | null;
    lostBuyers: number;
    decreasingCustomers: number;
  };
}
