/** 매장 월별 매출·총객수 목표 (기간별) */

export interface MonthTarget {
  sales: number;
  /** 월 총객수 목표 */
  customers: number;
}

export interface TargetPeriod {
  id: string;
  startYm: string;
  endYm: string;
  months: Record<string, MonthTarget>;
}

export interface StoreSalesTargetsDoc {
  storeId: string;
  periods: TargetPeriod[];
  updatedAt?: string;
}

export interface TargetProgressResult {
  daysElapsed: number;
  daysInMonth: number;
  daysRemaining: number;
  avgDailyCustomers: number;
  avgDailySales: number;
  targetDailyCustomers: number;
  salesPct: number | null;
  customersPct: number | null;
  salesPacePct: number | null;
  customersPacePct: number | null;
  remainingSales: number;
  remainingCustomers: number;
  dailySalesNeeded: number;
  dailyCustomersNeeded: number;
  projectedSales: number;
  projectedCustomers: number;
  achievementLikelihoodPct: number | null;
  achievementStatus: 'achieved' | 'on_track' | 'at_risk' | 'unlikely' | null;
}

const DEFAULT_START = '2025-05';
const DEFAULT_END = '9999-12';

export function createDefaultTargetsDoc(storeId: string): StoreSalesTargetsDoc {
  return {
    storeId,
    periods: [
      {
        id: 'default',
        startYm: DEFAULT_START,
        endYm: DEFAULT_END,
        months: {},
      },
    ],
  };
}

export function ymToParts(ym: string) {
  const [y, m] = ym.split('-').map(Number);
  return { year: y, month: m };
}

export function addMonthsYm(ym: string, delta: number): string {
  const { year, month } = ymToParts(ym);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** 직전 월 YYYY-MM (2027-01 → 2026-12) */
export function monthBeforeYm(ym: string): string {
  return addMonthsYm(ym, -1);
}

export function daysInMonthYm(ym: string): number {
  const { year, month } = ymToParts(ym);
  return new Date(year, month, 0).getDate();
}

export function ymInRange(ym: string, startYm: string, endYm: string): boolean {
  return ym >= startYm && ym <= endYm;
}

/** 기간 겹침 방지 — 새 기간 추가 시 직전 open 기간 endYm 자동 조정 */
export function normalizeTargetPeriods(periods: TargetPeriod[]): TargetPeriod[] {
  const sorted = [...periods]
    .map(p => ({
      ...p,
      startYm: p.startYm || DEFAULT_START,
      endYm: p.endYm || DEFAULT_END,
      months: p.months || {},
    }))
    .sort((a, b) => a.startYm.localeCompare(b.startYm));

  for (let i = 0; i < sorted.length - 1; i++) {
    const nextStart = sorted[i + 1].startYm;
    const capEnd = monthBeforeYm(nextStart);
    if (sorted[i].endYm > capEnd || sorted[i].endYm >= nextStart) {
      sorted[i] = { ...sorted[i], endYm: capEnd };
    }
  }

  return sorted;
}

/** 오늘(YYYY-MM)이 속한 목표 기간 */
export function resolveActivePeriod(
  periods: TargetPeriod[],
  todayYm: string,
): TargetPeriod | null {
  const normalized = normalizeTargetPeriods(periods);
  return normalized.find(p => ymInRange(todayYm, p.startYm, p.endYm)) ?? null;
}

/** 직전 목표 기간 (바로 앞 구간) */
export function resolvePreviousPeriod(
  periods: TargetPeriod[],
  todayYm: string,
): TargetPeriod | null {
  const normalized = normalizeTargetPeriods(periods);
  const active = resolveActivePeriod(normalized, todayYm);
  if (!active) return null;
  const idx = normalized.findIndex(p => p.id === active.id);
  return idx > 0 ? normalized[idx - 1] : null;
}

export function getMonthTarget(
  period: TargetPeriod | null,
  ym: string,
): MonthTarget {
  if (!period) return { sales: 0, customers: 0 };
  const m = period.months?.[ym];
  return {
    sales: Number(m?.sales) || 0,
    customers: Number(m?.customers) || 0,
  };
}

function countDaysInclusive(startYmd: string, endYmd: string): number {
  const start = new Date(`${startYmd}T12:00:00+09:00`);
  const end = new Date(`${endYmd}T12:00:00+09:00`);
  return Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
}

/** 이번 주에 해당하는 월 목표를 일수 비율로 환산 */
export function prorateWeekTarget(
  monthTarget: MonthTarget,
  weekStartYmd: string,
  weekEndYmd: string,
  todayYmd: string,
): MonthTarget {
  const end = weekEndYmd > todayYmd ? todayYmd : weekEndYmd;
  const ym = todayYmd.slice(0, 7);
  const dim = daysInMonthYm(ym);
  const weekDays = countDaysInclusive(weekStartYmd, end);
  const ratio = weekDays / dim;
  return {
    sales: Math.round(monthTarget.sales * ratio),
    customers: Math.round(monthTarget.customers * ratio),
  };
}

export function computeTargetProgress(opts: {
  actualNet: number;
  actualCustomers: number;
  startYmd: string;
  endYmd: string;
  /** 해당 구간 목표 (월간=월 목표, 주간=주간 환산 목표) */
  target: MonthTarget;
  todayYmd: string;
  /**
   * 진도율(페이스) 분모 — 월간: 당월 총 일수, 주간: 7(월~일)
   * 미지정 시 당월 일수 (주간에 월 일수를 쓰면 진도율이 비정상적으로 커짐)
   */
  periodDays?: number;
}): TargetProgressResult {
  const { actualNet, actualCustomers, startYmd, endYmd, target, todayYmd } = opts;
  const ym = todayYmd.slice(0, 7);
  const daysInMonth = daysInMonthYm(ym);
  const periodDays = opts.periodDays ?? daysInMonth;
  const daysElapsed = countDaysInclusive(startYmd, todayYmd > endYmd ? endYmd : todayYmd);

  const avgDailyCustomers = Math.round(actualCustomers / daysElapsed);
  const avgDailySales = Math.round(actualNet / daysElapsed);
  const daysRemaining = Math.max(0, periodDays - daysElapsed);
  const isWeekScope = periodDays < daysInMonth;
  const targetDailyCustomers =
    target.customers > 0
      ? Math.round(target.customers / (isWeekScope ? daysElapsed : daysInMonth))
      : 0;

  const salesPct =
    target.sales > 0 ? Math.round((actualNet / target.sales) * 100) : null;
  const customersPct =
    target.customers > 0
      ? Math.round((actualCustomers / target.customers) * 100)
      : null;

  const timeRatio = periodDays > 0 ? daysElapsed / periodDays : 0;
  const salesPacePct =
    target.sales > 0 && timeRatio > 0
      ? Math.round((actualNet / target.sales / timeRatio) * 100)
      : null;
  const customersPacePct =
    target.customers > 0 && timeRatio > 0
      ? Math.round((actualCustomers / target.customers / timeRatio) * 100)
      : null;

  const remainingSales = Math.max(0, target.sales - actualNet);
  const remainingCustomers = Math.max(0, target.customers - actualCustomers);
  const dailySalesNeeded =
    daysRemaining > 0 && remainingSales > 0 ? Math.ceil(remainingSales / daysRemaining) : 0;
  const dailyCustomersNeeded =
    daysRemaining > 0 && remainingCustomers > 0 ? Math.ceil(remainingCustomers / daysRemaining) : 0;
  const projectedSales = Math.round(actualNet + avgDailySales * daysRemaining);
  const projectedCustomers = Math.round(actualCustomers + avgDailyCustomers * daysRemaining);

  let achievementLikelihoodPct: number | null = null;
  let achievementStatus: TargetProgressResult['achievementStatus'] = null;
  if (target.sales > 0) {
    if (actualNet >= target.sales) {
      achievementLikelihoodPct = 100;
      achievementStatus = 'achieved';
    } else {
      achievementLikelihoodPct = Math.min(99, Math.round((projectedSales / target.sales) * 100));
      if (achievementLikelihoodPct >= 90) achievementStatus = 'on_track';
      else if (achievementLikelihoodPct >= 60) achievementStatus = 'at_risk';
      else achievementStatus = 'unlikely';
    }
  } else if (target.customers > 0) {
    if (actualCustomers >= target.customers) {
      achievementLikelihoodPct = 100;
      achievementStatus = 'achieved';
    } else {
      achievementLikelihoodPct = Math.min(99, Math.round((projectedCustomers / target.customers) * 100));
      if (achievementLikelihoodPct >= 90) achievementStatus = 'on_track';
      else if (achievementLikelihoodPct >= 60) achievementStatus = 'at_risk';
      else achievementStatus = 'unlikely';
    }
  }

  return {
    daysElapsed,
    daysInMonth: periodDays,
    daysRemaining,
    avgDailyCustomers,
    avgDailySales,
    targetDailyCustomers,
    salesPct,
    customersPct,
    salesPacePct,
    customersPacePct,
    remainingSales,
    remainingCustomers,
    dailySalesNeeded,
    dailyCustomersNeeded,
    projectedSales,
    projectedCustomers,
    achievementLikelihoodPct,
    achievementStatus,
  };
}

/** 기간 내 YYYY-MM 목록 */
export function listMonthsInPeriod(startYm: string, endYm: string, capYm?: string): string[] {
  const end = capYm && capYm < endYm ? capYm : endYm;
  const out: string[] = [];
  let cur = startYm;
  while (cur <= end) {
    out.push(cur);
    if (cur === end) break;
    cur = addMonthsYm(cur, 1);
    if (out.length > 600) break;
  }
  return out;
}

export function newPeriodId() {
  return `p_${Date.now()}`;
}
