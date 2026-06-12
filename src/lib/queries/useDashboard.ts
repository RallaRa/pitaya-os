'use client';

import { useQuery } from '@tanstack/react-query';
import { STALE_TIME, queryKeys } from '@/lib/queries/keys';
import { fetchAuthJson } from '@/lib/queries/fetchJson';
import type { CustomerVisitSummary } from '@/lib/customerVisitStats';

function isSoftDashboardError(data: Record<string, unknown>): boolean {
  if (data.aiError === true || data.noData === true) return true;
  if ('today' in data || 'news' in data || 'items' in data || 'summary' in data) return true;
  if ('opinion' in data || 'topItems' in data) return true;
  return false;
}

async function fetchDashboard<T>(url: string): Promise<T> {
  const data = await fetchAuthJson<T & { error?: string }>(url);
  if (
    data
    && typeof data === 'object'
    && 'error' in data
    && data.error
    && !isSoftDashboardError(data as Record<string, unknown>)
  ) {
    throw new Error(String(data.error));
  }
  return data as T;
}

function useDashboardQuery<T>(
  key: readonly unknown[],
  url: string,
  options?: { enabled?: boolean; refetchInterval?: number; staleTime?: number },
) {
  return useQuery({
    queryKey: key,
    queryFn: () => fetchDashboard<T>(url),
    enabled: options?.enabled ?? true,
    staleTime: options?.staleTime ?? STALE_TIME.sales,
    refetchInterval: options?.refetchInterval,
    refetchIntervalInBackground: !!options?.refetchInterval,
    refetchOnWindowFocus: true,
  });
}

export interface SalesCompareData {
  week: unknown;
  month: unknown;
  targetsMeta: unknown;
  emptyReason?: string | null;
}

export function useSalesCompare(storeId: string, enabled = true) {
  return useDashboardQuery<SalesCompareData>(
    queryKeys.dashboard.salesCompare(storeId),
    `/api/dashboard/sales-compare?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 60_000 },
  );
}

export function useCustomerVisitSummary(storeId: string, enabled = true) {
  return useDashboardQuery<CustomerVisitSummary>(
    queryKeys.dashboard.customerVisit(storeId),
    `/api/dashboard/customer-visit-summary?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 60_000 },
  );
}

export interface YesterdayAnalysisData {
  dateLabel: string;
  top: { name: string; qty: number; amount: number }[];
  bottom: { name: string; qty: number; amount: number }[];
  noData?: boolean;
  emptyReason?: string;
  ai?: unknown;
}

export function useYesterdayAnalysis(storeId: string, enabled = true) {
  return useDashboardQuery<YesterdayAnalysisData>(
    queryKeys.dashboard.yesterday(storeId),
    `/api/dashboard/yesterday-analysis?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 30_000 },
  );
}

export interface WeeklyAnalysisData {
  top: { name: string; qty: number; amount: number; pctChange?: number | null }[];
  bottom: { name: string; qty: number; amount: number }[];
  insight: string;
  emptyReason?: string;
  ai?: unknown;
}

export function useWeeklyAnalysis(storeId: string, enabled = true) {
  return useDashboardQuery<WeeklyAnalysisData>(
    queryKeys.dashboard.weekly(storeId),
    `/api/dashboard/weekly-analysis?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export interface CostRatioData {
  storeAvgRatio: number | null;
  globalTargetRatio: number;
  items: {
    id: string;
    name: string;
    actualRatio: number;
    targetRatio: number;
    isOverTarget: boolean;
    isEstimated: boolean;
  }[];
  offenders: CostRatioData['items'];
}

export function useCostRatio(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.costRatio(storeId),
    queryFn: async () => {
      const data = await fetchDashboard<CostRatioData>(
        `/api/dashboard/cost-ratio?storeId=${encodeURIComponent(storeId)}`,
      );
      return {
        storeAvgRatio: data.storeAvgRatio ?? null,
        globalTargetRatio: data.globalTargetRatio ?? 0.65,
        items: data.items ?? [],
        offenders: data.offenders ?? [],
      };
    },
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.products,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export interface WeatherData {
  regionSido: string;
  currentTemp: number;
  days: {
    date: string;
    condition: string;
    icon: string;
    tempMax: number;
    tempMin: number;
    precipProb: number;
  }[];
}

export function useWeather(storeId: string, enabled = true) {
  return useDashboardQuery<WeatherData>(
    queryKeys.dashboard.weather(storeId),
    `/api/dashboard/weather?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, staleTime: 10 * 60_000, refetchInterval: 60 * 60_000 },
  );
}

export interface NewsItem {
  title: string;
  link: string;
  pubDate: string;
  source: string;
}

export function useNews(enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.news(),
    queryFn: async () => {
      const data = await fetchDashboard<{ news?: NewsItem[] }>('/api/dashboard/news');
      return data.news ?? [];
    },
    enabled,
    staleTime: 10 * 60_000,
    refetchInterval: 30 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export function useAiInsight(storeId: string, enabled = true) {
  return useDashboardQuery<Record<string, unknown>>(
    queryKeys.dashboard.aiInsight(storeId),
    `/api/dashboard/comprehensive-opinion?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export function useTotalPartner(storeId: string, enabled = true) {
  return useDashboardQuery<Record<string, unknown>>(
    queryKeys.dashboard.totalPartner(storeId),
    `/api/dashboard/total-partner?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export function useSalesPrediction(storeId: string, enabled = true) {
  return useDashboardQuery<Record<string, unknown>>(
    queryKeys.dashboard.salesPrediction(storeId),
    `/api/dashboard/sales-prediction?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export interface SalesHeatmapData {
  cells: unknown[][];
  insights: unknown[];
}

export function useSalesHeatmap(storeId: string, range = '1m', enabled = true) {
  return useDashboardQuery<SalesHeatmapData>(
    queryKeys.dashboard.salesHeatmap(storeId, range),
    `/api/dashboard/sales-heatmap?storeId=${encodeURIComponent(storeId)}&range=${range}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export interface DowProfitabilityData {
  rows: unknown[];
  insights: unknown[];
}

export function useDowProfitability(storeId: string, period: string, enabled = true) {
  return useDashboardQuery<DowProfitabilityData>(
    queryKeys.dashboard.dowProfitability(storeId, period),
    `/api/dashboard/dow-profitability?storeId=${encodeURIComponent(storeId)}&period=${period}`,
    { enabled: enabled && !!storeId, refetchInterval: 5 * 60_000 },
  );
}

export interface ChurnRiskData {
  items: unknown[];
  totalAtRisk: number;
}

export function useChurnRisk(storeId: string, limit = 10, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.churnRisk(storeId, limit),
    queryFn: async () => {
      const data = await fetchDashboard<ChurnRiskData & { error?: string }>(
        `/api/dashboard/churn-risk?storeId=${encodeURIComponent(storeId)}&limit=${limit}`,
      );
      return { items: data.items ?? [], totalAtRisk: data.totalAtRisk ?? 0 };
    },
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.customers,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export interface TimeSlotAovData {
  slots: unknown[];
  insight: string | null;
}

export function useTimeSlotAov(storeId: string, date: string, enabled = true) {
  return useDashboardQuery<TimeSlotAovData>(
    queryKeys.dashboard.timeSlotAov(storeId, date),
    `/api/dashboard/time-slot-aov?storeId=${encodeURIComponent(storeId)}&date=${date}`,
    { enabled: enabled && !!storeId && !!date, refetchInterval: 60_000 },
  );
}

export interface SalesCategoriesData {
  chart: unknown[];
  totalAmount: number;
  emptyReason: string | null;
}

export function useSalesCategories(storeId: string, date: string, enabled = true) {
  return useDashboardQuery<SalesCategoriesData>(
    queryKeys.dashboard.salesCategories(storeId, date),
    `/api/dashboard/sales-categories?storeId=${encodeURIComponent(storeId)}&date=${date}`,
    { enabled: enabled && !!storeId && !!date, refetchInterval: 60_000 },
  );
}

export function useOrderDeliveryGap(storeId: string, enabled = true) {
  return useDashboardQuery<Record<string, unknown>>(
    queryKeys.dashboard.orderDeliveryGap(storeId),
    `/api/order/check-delivery-gap?storeId=${encodeURIComponent(storeId)}`,
    { enabled: enabled && !!storeId, staleTime: 10 * 60_000 },
  );
}

export interface MarginRankingData {
  avgMargin: number | null;
  globalTargetMargin: number;
  achievementRate: number | null;
  top10: unknown[];
  bottom5: unknown[];
  insights: unknown[];
}

export function useMarginRanking(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.marginRanking(storeId),
    queryFn: async () => {
      const d = await fetchDashboard<MarginRankingData>(
        `/api/dashboard/margin-ranking?storeId=${encodeURIComponent(storeId)}`,
      );
      return {
        avgMargin: d.avgMargin ?? null,
        globalTargetMargin: d.globalTargetMargin ?? 0.35,
        achievementRate: d.achievementRate ?? null,
        top10: d.top10 ?? [],
        bottom5: d.bottom5 ?? [],
        insights: d.insights ?? [],
      };
    },
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.products,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}

export interface RepurchaseDueData {
  customers: unknown[];
  count: number;
  date: string;
}

export function useRepurchaseDue(storeId: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.dashboard.repurchaseDue(storeId),
    queryFn: async () => {
      const d = await fetchDashboard<RepurchaseDueData>(
        `/api/dashboard/repurchase-due?storeId=${encodeURIComponent(storeId)}`,
      );
      return {
        customers: d.customers ?? [],
        count: d.count ?? 0,
        date: d.date ?? '',
      };
    },
    enabled: enabled && !!storeId,
    staleTime: STALE_TIME.customers,
    refetchInterval: 5 * 60_000,
    refetchOnWindowFocus: true,
  });
}
