import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { normDateYMD } from '@/lib/dateUtils';

export type VisitCycleStatus = 'unknown' | 'new' | 'active' | 'due_soon' | 'overdue';

export interface VisitCycleInfo {
  distinctVisitDays: number;
  avgCycleDays: number | null;
  medianCycleDays: number | null;
  daysSinceLastVisit: number | null;
  expectedNextVisit: string | null;
  cycleStatus: VisitCycleStatus;
  cycleStatusLabel: string;
}

const STATUS_LABELS: Record<VisitCycleStatus, string> = {
  unknown: '데이터없음',
  new: '신규(1회)',
  active: '정상',
  due_soon: '재방문임박',
  overdue: '이탈위험',
};

function daysBetween(fromYmd: string, toYmd: string): number {
  const a = new Date(`${fromYmd}T12:00:00+09:00`);
  const b = new Date(`${toYmd}T12:00:00+09:00`);
  return Math.round((b.getTime() - a.getTime()) / 86400000);
}

function median(nums: number[]): number | null {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid] : Math.round((s[mid - 1] + s[mid]) / 2);
}

/** pos_customer_sales 문서 → 고객별 방문일(중복 제거) */
export function buildVisitDatesMap(
  salesDocs: Array<{ cusCode?: string; date?: string }>,
): Map<string, string[]> {
  const sets = new Map<string, Set<string>>();
  for (const r of salesDocs) {
    const code = String(r.cusCode || '').trim();
    const date = normDateYMD(String(r.date || ''));
    if (!code || !date) continue;
    if (!sets.has(code)) sets.set(code, new Set());
    sets.get(code)!.add(date);
  }
  const out = new Map<string, string[]>();
  for (const [code, set] of sets) {
    out.set(code, [...set].sort());
  }
  return out;
}

/** 방문일 목록으로 주기·상태 계산 */
export function computeVisitCycle(
  visitDates: string[],
  todayYmd = getKSTTodayYMD(),
): VisitCycleInfo {
  const sorted = [...visitDates].map(normDateYMD).filter(Boolean).sort();
  const distinctVisitDays = sorted.length;

  if (distinctVisitDays === 0) {
    return {
      distinctVisitDays: 0,
      avgCycleDays: null,
      medianCycleDays: null,
      daysSinceLastVisit: null,
      expectedNextVisit: null,
      cycleStatus: 'unknown',
      cycleStatusLabel: STATUS_LABELS.unknown,
    };
  }

  const lastVisit = sorted[sorted.length - 1];
  const daysSinceLastVisit = daysBetween(lastVisit, todayYmd);

  if (distinctVisitDays === 1) {
    return {
      distinctVisitDays: 1,
      avgCycleDays: null,
      medianCycleDays: null,
      daysSinceLastVisit,
      expectedNextVisit: null,
      cycleStatus: 'new',
      cycleStatusLabel: STATUS_LABELS.new,
    };
  }

  const intervals: number[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const gap = daysBetween(sorted[i - 1], sorted[i]);
    if (gap > 0) intervals.push(gap);
  }

  if (!intervals.length) {
    return {
      distinctVisitDays,
      avgCycleDays: null,
      medianCycleDays: null,
      daysSinceLastVisit,
      expectedNextVisit: null,
      cycleStatus: 'new',
      cycleStatusLabel: STATUS_LABELS.new,
    };
  }

  const avgCycleDays = Math.round(intervals.reduce((a, b) => a + b, 0) / intervals.length);
  const medianCycleDays = median(intervals);
  const cycleBase = medianCycleDays ?? avgCycleDays;
  const expectedNextVisit = addDaysYMD(lastVisit, cycleBase);

  let cycleStatus: VisitCycleStatus = 'active';
  if (daysSinceLastVisit > cycleBase * 1.3) {
    cycleStatus = 'overdue';
  } else if (daysSinceLastVisit >= cycleBase * 0.85) {
    cycleStatus = 'due_soon';
  }

  return {
    distinctVisitDays,
    avgCycleDays,
    medianCycleDays,
    daysSinceLastVisit,
    expectedNextVisit,
    cycleStatus,
    cycleStatusLabel: STATUS_LABELS[cycleStatus],
  };
}

/** pos_customers 스냅샷으로 거친 추정 (구매이력 없을 때) */
export function estimateCycleFromSnapshot(
  visitCount: number,
  joinDate: string,
  lastVisitDate: string,
  todayYmd = getKSTTodayYMD(),
): VisitCycleInfo | null {
  const join = normDateYMD(joinDate);
  const last = normDateYMD(lastVisitDate);
  if (visitCount < 2 || !join || !last || last <= join) return null;

  const span = daysBetween(join, last);
  const avgCycleDays = Math.round(span / (visitCount - 1));
  if (avgCycleDays <= 0) return null;

  const daysSinceLastVisit = daysBetween(last, todayYmd);
  const expectedNextVisit = addDaysYMD(last, avgCycleDays);

  let cycleStatus: VisitCycleStatus = 'active';
  if (daysSinceLastVisit > avgCycleDays * 1.3) cycleStatus = 'overdue';
  else if (daysSinceLastVisit >= avgCycleDays * 0.85) cycleStatus = 'due_soon';

  return {
    distinctVisitDays: visitCount,
    avgCycleDays,
    medianCycleDays: avgCycleDays,
    daysSinceLastVisit,
    expectedNextVisit,
    cycleStatus,
    cycleStatusLabel: `${STATUS_LABELS[cycleStatus]}(추정)`,
  };
}

export function mergeVisitCycle(
  fromSales: VisitCycleInfo,
  fallbackVisitCount: number,
  joinDate: string,
  lastVisitDate: string,
): VisitCycleInfo {
  if (fromSales.distinctVisitDays >= 2) return fromSales;
  const estimated = estimateCycleFromSnapshot(fallbackVisitCount, joinDate, lastVisitDate);
  if (estimated && fromSales.distinctVisitDays === 0) return estimated;
  if (estimated && fromSales.distinctVisitDays === 1 && fallbackVisitCount >= 2) return estimated;
  return fromSales;
}

/** 방문 분석용 — 주기 구간 분포 */
export function cycleDistributionBuckets(cycles: Array<{ avgCycleDays: number | null }>) {
  const buckets = [
    { label: '7일 이내', count: 0 },
    { label: '8~14일', count: 0 },
    { label: '15~30일', count: 0 },
    { label: '31일+', count: 0 },
  ];
  for (const c of cycles) {
    const d = c.avgCycleDays;
    if (d == null) continue;
    if (d <= 7) buckets[0].count++;
    else if (d <= 14) buckets[1].count++;
    else if (d <= 30) buckets[2].count++;
    else buckets[3].count++;
  }
  return buckets;
}
