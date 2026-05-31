/**
 * 근로기준법 기준 연차 계산
 * - 1년 미만: 만근 월 1일씩 부여
 * - 1년 만근: 12일 + 3일 보너스 = 15일
 * - 1년 이후: 15일 기본, 입사 2년차부터 매년 1일 추가 (최대 25일)
 */

const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const MAX_ANNUAL_LEAVE = 25;

export function parseYmd(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function formatYmd(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

export function isDayOff(d: Date, daysOff: string[] = ['토', '일']): boolean {
  return daysOff.includes(DAY_NAMES[d.getDay()]);
}

/** 입사일 기준 완료된 근속 연수 (첫 1년 미만 = 0) */
export function getCompletedYears(hireDate: Date, asOf: Date): number {
  if (asOf < hireDate) return 0;
  let years = asOf.getFullYear() - hireDate.getFullYear();
  const anniv = new Date(hireDate);
  anniv.setFullYear(asOf.getFullYear());
  if (asOf < anniv) years -= 1;
  return Math.max(0, years);
}

/** 현재 연차 연도 시작일 (입사일 기준) */
export function getLeaveYearStart(hireDate: Date, asOf: Date): Date {
  if (asOf < hireDate) return hireDate;
  const years = getCompletedYears(hireDate, asOf);
  const start = new Date(hireDate);
  start.setFullYear(hireDate.getFullYear() + years);
  if (start > asOf) {
    start.setFullYear(start.getFullYear() - 1);
  }
  return start;
}

/** 해당 월의 근무일 / 출근일 비율로 만근 판정 (100%) */
export function isFullAttendanceMonth(
  monthStart: Date,
  monthEnd: Date,
  hireDate: Date,
  resignDate: Date | null,
  attendanceDates: Set<string>,
  daysOff: string[] = ['토', '일'],
): boolean {
  let workDays = 0;
  let attendDays = 0;

  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
    if (d < hireDate) continue;
    if (resignDate && d > resignDate) continue;
    if (isDayOff(d, daysOff)) continue;
    workDays += 1;
    if (attendanceDates.has(formatYmd(d))) attendDays += 1;
  }

  if (workDays === 0) return false;
  return attendDays >= workDays;
}

/** 기간 내 만근 월 수 */
export function countFullMonths(
  periodStart: Date,
  periodEnd: Date,
  hireDate: Date,
  resignDate: Date | null,
  attendanceDates: Set<string>,
  daysOff: string[] = ['토', '일'],
): number {
  let count = 0;
  let cursor = new Date(periodStart.getFullYear(), periodStart.getMonth(), 1);
  const end = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);

  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const effectiveEnd = monthEnd > periodEnd ? periodEnd : monthEnd;
    const effectiveStart = monthStart < periodStart ? periodStart : monthStart;

    if (effectiveStart <= effectiveEnd &&
        isFullAttendanceMonth(effectiveStart, effectiveEnd, hireDate, resignDate, attendanceDates, daysOff)) {
      count += 1;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return count;
}

export interface AnnualLeaveResult {
  total: number;
  rule: string;
  completedYears: number;
  fullMonths: number;
  leaveYearStart: string;
  leaveYearNumber: number;
}

/**
 * 연차 총 부여일수 계산
 */
export function calculateAnnualLeaveEntitlement(
  hireDateStr: string,
  asOfStr: string,
  attendanceDates: Set<string>,
  options: {
    daysOff?: string[];
    resignDate?: string;
  } = {},
): AnnualLeaveResult {
  const hireDate = parseYmd(hireDateStr);
  const asOf = parseYmd(asOfStr);
  const resignDate = options.resignDate ? parseYmd(options.resignDate) : null;
  const daysOff = options.daysOff ?? ['토', '일'];

  const completedYears = getCompletedYears(hireDate, asOf);
  const leaveYearStart = getLeaveYearStart(hireDate, asOf);
  const leaveYearNumber = completedYears + 1;

  if (completedYears < 1) {
    const fullMonths = countFullMonths(hireDate, asOf, hireDate, resignDate, attendanceDates, daysOff);
    return {
      total: fullMonths,
      rule: '1년 미만 — 만근 월 1일',
      completedYears,
      fullMonths,
      leaveYearStart: formatYmd(leaveYearStart),
      leaveYearNumber,
    };
  }

  const firstAnniversary = new Date(hireDate);
  firstAnniversary.setFullYear(firstAnniversary.getFullYear() + 1);
  const firstYearEnd = addDays(firstAnniversary, -1);
  const firstYearFullMonths = countFullMonths(hireDate, firstYearEnd, hireDate, resignDate, attendanceDates, daysOff);

  let total: number;
  let rule: string;

  if (firstYearFullMonths >= 12) {
    total = Math.min(MAX_ANNUAL_LEAVE, 15 + Math.max(0, completedYears - 1));
    rule = completedYears === 1
      ? '1년 만근 — 15일 (12+3)'
      : `${completedYears}년차 — 15일 + ${completedYears - 1}일`;
  } else {
    total = Math.min(firstYearFullMonths, 11);
    rule = `1년차 미만 만근 ${firstYearFullMonths}개월`;
  }

  return {
    total,
    rule,
    completedYears,
    fullMonths: firstYearFullMonths,
    leaveYearStart: formatYmd(leaveYearStart),
    leaveYearNumber,
  };
}

/** 연차/반차 사용일수 계산 */
export function countLeaveDaysUsed(
  startDate: string,
  endDate: string,
  leaveType: string,
  daysOff: string[] = ['토', '일'],
): number {
  if (leaveType === 'unpaid') return 0;
  if (leaveType === 'half_am' || leaveType === 'half_pm') return 0.5;

  const start = parseYmd(startDate);
  const end = parseYmd(endDate);
  let days = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (!isDayOff(d, daysOff)) days += 1;
  }
  return days;
}
