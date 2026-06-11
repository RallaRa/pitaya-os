import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';
import {
  buildVisitDatesMap,
  computeVisitCycle,
  mergeVisitCycle,
} from '@/lib/customerVisitCycle';
import { computeVisitTrend, type VisitTrendSegment } from '@/lib/customerVisitTrend';

export const CHURN_RISK_THRESHOLD = 70;

export interface ChurnScoreFactors {
  overdueDays: number;
  frequencyDecline: number;
  spendDecline: number;
  couponUnused: number;
}

export interface ChurnScoreResult {
  churnScore: number;
  factors: ChurnScoreFactors;
  isAtRisk: boolean;
  daysSinceLastVisit: number | null;
  avgCycleDays: number | null;
  visitTrend: VisitTrendSegment;
}

export interface SalesRowLite {
  cusCode?: string;
  date?: string;
  totalSale?: number;
}

/** 평균 방문 주기 대비 초과일수 (0~40점) */
export function scoreOverdueDays(
  daysSince: number | null,
  cycleBase: number | null,
): number {
  if (daysSince == null) return 0;
  if (cycleBase == null || cycleBase <= 0) {
    if (daysSince >= 60) return 30;
    if (daysSince >= 45) return 20;
    if (daysSince >= 30) return 10;
    return 0;
  }
  const ratio = daysSince / cycleBase;
  if (ratio <= 1) return 0;
  if (ratio >= 1.5) return 40;
  return Math.round(((ratio - 1) / 0.5) * 40);
}

/** 방문 빈도 감소 추세 (0~30점) */
export function scoreFrequencyDecline(segment: VisitTrendSegment): number {
  if (segment === 'churned' || segment === 'decreasing') return 30;
  if (segment === 'stable') return 5;
  return 0;
}

/** 구매금액 감소 추세 — 최근 30일 vs 직전 30일 방문당 평균 (0~20점) */
export function scoreSpendDecline(
  salesRows: SalesRowLite[],
  todayYmd = getKSTTodayYMD(),
): number {
  const recentStart = addDaysYMD(todayYmd, -30);
  const priorStart = addDaysYMD(todayYmd, -60);

  let recentTotal = 0;
  let recentVisits = 0;
  let priorTotal = 0;
  let priorVisits = 0;

  for (const row of salesRows) {
    const d = normDateYMD(String(row.date || ''));
    const sale = Number(row.totalSale || 0);
    if (!d || sale <= 0) continue;
    if (d >= recentStart && d <= todayYmd) {
      recentTotal += sale;
      recentVisits++;
    } else if (d >= priorStart && d < recentStart) {
      priorTotal += sale;
      priorVisits++;
    }
  }

  if (priorVisits < 1 || recentVisits < 1) return 0;
  const recentAvg = recentTotal / recentVisits;
  const priorAvg = priorTotal / priorVisits;
  if (priorAvg <= 0) return 0;

  const ratio = recentAvg / priorAvg;
  if (ratio >= 0.85) return 0;
  if (ratio <= 0.5) return 20;
  return Math.round(((0.85 - ratio) / 0.35) * 20);
}

/** 최근 쿠폰 미사용 (0~10점) */
export function scoreCouponUnused(opts: {
  distinctVisitDays: number;
  hasRecentRedemption: boolean;
  hasSentCouponJourney: boolean;
}): number {
  if (opts.hasRecentRedemption) return 0;
  if (opts.hasSentCouponJourney) return 10;
  if (opts.distinctVisitDays >= 2) return 5;
  return 0;
}

export function computeChurnScore(input: {
  visitDates: string[];
  salesRows: SalesRowLite[];
  fallbackVisitCount: number;
  joinDate: string;
  lastVisitDate: string;
  hasRecentRedemption: boolean;
  hasSentCouponJourney: boolean;
  todayYmd?: string;
}): ChurnScoreResult {
  const todayYmd = input.todayYmd || getKSTTodayYMD();
  const fromSales = computeVisitCycle(input.visitDates, todayYmd);
  const cycle = mergeVisitCycle(
    fromSales,
    input.fallbackVisitCount,
    input.joinDate,
    input.lastVisitDate,
  );
  const trend = computeVisitTrend(input.visitDates, todayYmd);
  const cycleBase = cycle.medianCycleDays ?? cycle.avgCycleDays;

  const factors: ChurnScoreFactors = {
    overdueDays: scoreOverdueDays(cycle.daysSinceLastVisit, cycleBase),
    frequencyDecline: scoreFrequencyDecline(trend.segment),
    spendDecline: scoreSpendDecline(input.salesRows, todayYmd),
    couponUnused: scoreCouponUnused({
      distinctVisitDays: cycle.distinctVisitDays,
      hasRecentRedemption: input.hasRecentRedemption,
      hasSentCouponJourney: input.hasSentCouponJourney,
    }),
  };

  const churnScore = Math.min(
    100,
    factors.overdueDays
      + factors.frequencyDecline
      + factors.spendDecline
      + factors.couponUnused,
  );

  return {
    churnScore,
    factors,
    isAtRisk: churnScore >= CHURN_RISK_THRESHOLD,
    daysSinceLastVisit: cycle.daysSinceLastVisit,
    avgCycleDays: cycleBase,
    visitTrend: trend.segment,
  };
}

/** pos_customer_sales → 고객별 매출 행 */
export function groupSalesByCustomer(
  salesDocs: SalesRowLite[],
): Map<string, SalesRowLite[]> {
  const map = new Map<string, SalesRowLite[]>();
  for (const row of salesDocs) {
    const code = String(row.cusCode || '').trim();
    if (!code) continue;
    if (!map.has(code)) map.set(code, []);
    map.get(code)!.push(row);
  }
  return map;
}

export function buildVisitDatesFromSales(salesDocs: SalesRowLite[]): Map<string, string[]> {
  return buildVisitDatesMap(salesDocs);
}
