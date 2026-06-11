import { getKSTTodayYMD, normDateYMD, subtractMonthsYMD } from '@/lib/dateUtils';

/** Pitaya RFM 자동 등급 (POS cusClass `grade`와 별도) */
export type PitayaGrade = 'VIP' | '단골' | '일반' | '이탈위험' | '이탈';

export const PITAYA_GRADE_LABELS: Record<PitayaGrade, string> = {
  VIP: 'VIP',
  '단골': '단골',
  '일반': '일반',
  '이탈위험': '이탈위험',
  '이탈': '이탈',
};

export interface CustomerGradeMetrics {
  cusCode: string;
  lastVisit: string;
  daysSinceLastVisit: number | null;
  monthlyAvgVisits: number;
  purchase3Months: number;
}

export interface GradeComputeInput {
  lastVisit: string;
  joinDate?: string;
  monthlyAvgVisits: number;
  purchase3Months: number;
  todayYmd?: string;
}

function daysBetween(fromYmd: string, toYmd: string): number {
  if (!fromYmd || !toYmd) return 99999;
  const a = new Date(`${fromYmd.slice(0, 10)}T12:00:00+09:00`).getTime();
  const b = new Date(`${toYmd.slice(0, 10)}T12:00:00+09:00`).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return 99999;
  return Math.floor((b - a) / 86400000);
}

/** RFM 기준 Pitaya 등급 산정 */
export function computePitayaGrade(input: GradeComputeInput): PitayaGrade {
  const today = input.todayYmd || getKSTTodayYMD();
  const lastVisit = normDateYMD(input.lastVisit || input.joinDate || '');
  const daysSince = lastVisit ? daysBetween(lastVisit, today) : 99999;

  if (daysSince >= 180) return '이탈';
  if (daysSince >= 90) return '이탈위험';

  const { monthlyAvgVisits, purchase3Months } = input;

  if (monthlyAvgVisits >= 2 && daysSince <= 30 && purchase3Months >= 300_000) {
    return 'VIP';
  }
  if (monthlyAvgVisits >= 1 && daysSince <= 60) {
    return '단골';
  }

  return '일반';
}

export interface SalesRowLite {
  cusCode?: string;
  date?: string;
  totalSale?: number;
  visitCount?: number;
}

/** pos_customer_sales 집계 → 등급 산정용 메트릭 */
export function buildGradeMetricsFromSales(
  cusCode: string,
  salesRows: SalesRowLite[],
  fallbackLastVisit = '',
  fallbackJoinDate = '',
  todayYmd = getKSTTodayYMD(),
): CustomerGradeMetrics {
  const threeMonthsAgo = subtractMonthsYMD(todayYmd, 3);
  let purchase3Months = 0;
  let visits3Months = 0;
  let lastVisit = normDateYMD(fallbackLastVisit);

  for (const row of salesRows) {
    if (String(row.cusCode || '') !== cusCode) continue;
    const d = normDateYMD(String(row.date || ''));
    if (!d) continue;
    if (!lastVisit || d > lastVisit) lastVisit = d;
    if (d >= threeMonthsAgo) {
      purchase3Months += Number(row.totalSale || 0);
      visits3Months += Number(row.visitCount || 1);
    }
  }

  if (!lastVisit) lastVisit = normDateYMD(fallbackJoinDate);

  const daysSinceLastVisit = lastVisit ? daysBetween(lastVisit, todayYmd) : null;
  const monthlyAvgVisits = visits3Months / 3;

  return {
    cusCode,
    lastVisit,
    daysSinceLastVisit,
    monthlyAvgVisits,
    purchase3Months,
  };
}

export function metricsToGrade(
  metrics: CustomerGradeMetrics,
  joinDate = '',
  todayYmd = getKSTTodayYMD(),
): PitayaGrade {
  return computePitayaGrade({
    lastVisit: metrics.lastVisit,
    joinDate,
    monthlyAvgVisits: metrics.monthlyAvgVisits,
    purchase3Months: metrics.purchase3Months,
    todayYmd,
  });
}

/** 등급 통계 집계 */
export function countByPitayaGrade(grades: PitayaGrade[]): Record<PitayaGrade, number> {
  const counts: Record<PitayaGrade, number> = {
    VIP: 0,
    '단골': 0,
    '일반': 0,
    '이탈위험': 0,
    '이탈': 0,
  };
  for (const g of grades) counts[g] = (counts[g] || 0) + 1;
  return counts;
}
