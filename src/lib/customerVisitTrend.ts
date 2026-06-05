import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';

/** 방문 패턴 변화 세그먼트 */
export type VisitTrendSegment =
  | 'unknown'
  | 'new'
  | 'stable'
  | 'churned'
  | 'increasing'
  | 'decreasing';

export interface VisitTrendInfo {
  segment: VisitTrendSegment;
  segmentLabel: string;
  /** 과거(90일 이전) 평균 방문 간격(일) */
  historicalAvgDays: number | null;
  /** 최근 90일 평균 방문 간격(일) — 작을수록 자주 방문 */
  recentAvgDays: number | null;
  /** recent / historical (<1 이면 방문 빈도 증가) */
  trendRatio: number | null;
  daysSinceLastVisit: number | null;
}

export const VISIT_TREND_LABELS: Record<VisitTrendSegment, string> = {
  unknown: '데이터없음',
  new: '신규(1회)',
  stable: '안정',
  churned: '방문끊김',
  increasing: '방문증가',
  decreasing: '방문감소',
};

/** 60일+ 미방문 또는 평소 주기 대비 1.5배 이상 경과 → 방문 끊김 */
export const CHURN_MIN_DAYS = 60;
export const CHURN_CYCLE_MULTIPLIER = 1.5;
/** 최근 vs 과거 비교 윈도우 */
export const RECENT_WINDOW_DAYS = 90;
/** recentAvg <= historical * 0.85 → 방문 증가 */
export const TREND_INCREASE_RATIO = 0.85;
/** recentAvg >= historical * 1.15 → 방문 감소 */
export const TREND_DECREASE_RATIO = 1.15;

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00+09:00`);
  const b = new Date(`${toYmd}T12:00:00+09:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function mean(nums: number[]): number | null {
  if (!nums.length) return null;
  return Math.round(nums.reduce((a, b) => a + b, 0) / nums.length);
}

function buildIntervals(sorted: string[]): number[] {
  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    if (gap > 0) intervals.push(gap);
  }
  return intervals;
}

/** 방문일 목록으로 패턴 변화 계산 */
export function computeVisitTrend(
  visitDates: string[],
  todayYmd = getKSTTodayYMD(),
): VisitTrendInfo {
  const sorted = [...visitDates].map(normDateYMD).filter(Boolean).sort();
  const distinctVisitDays = sorted.length;

  if (distinctVisitDays === 0) {
    return {
      segment: 'unknown',
      segmentLabel: VISIT_TREND_LABELS.unknown,
      historicalAvgDays: null,
      recentAvgDays: null,
      trendRatio: null,
      daysSinceLastVisit: null,
    };
  }

  const lastVisit = sorted[sorted.length - 1];
  const daysSinceLastVisit = daysBetween(lastVisit, todayYmd);

  if (distinctVisitDays === 1) {
    return {
      segment: 'new',
      segmentLabel: VISIT_TREND_LABELS.new,
      historicalAvgDays: null,
      recentAvgDays: null,
      trendRatio: null,
      daysSinceLastVisit,
    };
  }

  const intervals = buildIntervals(sorted);
  const overallAvg = mean(intervals);
  const recentCutoff = addDaysYMD(todayYmd, -RECENT_WINDOW_DAYS);

  const recentIntervals: number[] = [];
  const historicalIntervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    if (gap <= 0) continue;
    if (sorted[i] >= recentCutoff) recentIntervals.push(gap);
    else historicalIntervals.push(gap);
  }

  let historicalAvgDays = mean(historicalIntervals);
  let recentAvgDays = mean(recentIntervals);

  // 최근 데이터만 있으면 전반/후반 구간 비교
  if (historicalAvgDays == null && intervals.length >= 3) {
    const mid = Math.floor(intervals.length / 2);
    historicalAvgDays = mean(intervals.slice(0, mid));
    recentAvgDays = mean(intervals.slice(mid));
  }

  const churnThreshold = overallAvg != null
    ? Math.max(CHURN_MIN_DAYS, Math.round(overallAvg * CHURN_CYCLE_MULTIPLIER))
    : CHURN_MIN_DAYS;

  if (daysSinceLastVisit >= churnThreshold) {
    return {
      segment: 'churned',
      segmentLabel: VISIT_TREND_LABELS.churned,
      historicalAvgDays,
      recentAvgDays,
      trendRatio: historicalAvgDays && recentAvgDays
        ? Math.round((recentAvgDays / historicalAvgDays) * 100) / 100
        : null,
      daysSinceLastVisit,
    };
  }

  if (historicalAvgDays != null && recentAvgDays != null && historicalAvgDays > 0) {
    const trendRatio = Math.round((recentAvgDays / historicalAvgDays) * 100) / 100;
    let segment: VisitTrendSegment = 'stable';
    if (recentAvgDays <= historicalAvgDays * TREND_INCREASE_RATIO) segment = 'increasing';
    else if (recentAvgDays >= historicalAvgDays * TREND_DECREASE_RATIO) segment = 'decreasing';

    return {
      segment,
      segmentLabel: VISIT_TREND_LABELS[segment],
      historicalAvgDays,
      recentAvgDays,
      trendRatio,
      daysSinceLastVisit,
    };
  }

  return {
    segment: 'stable',
    segmentLabel: VISIT_TREND_LABELS.stable,
    historicalAvgDays,
    recentAvgDays,
    trendRatio: null,
    daysSinceLastVisit,
  };
}

export function countByVisitTrend(rows: Array<{ visitTrend: VisitTrendSegment }>) {
  return {
    churnedCount: rows.filter(r => r.visitTrend === 'churned').length,
    increasingCount: rows.filter(r => r.visitTrend === 'increasing').length,
    decreasingCount: rows.filter(r => r.visitTrend === 'decreasing').length,
    stableCount: rows.filter(r => r.visitTrend === 'stable').length,
  };
}
