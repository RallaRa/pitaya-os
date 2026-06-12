import { HOLIDAYS } from '@/components/calendar/CalendarTypes';
import { getKSTParts } from '@/lib/dateUtils';

/** 해당 월 영업일수 — 공휴일·매장 휴무일 제외 */
export function countBusinessDaysInMonth(
  year: number,
  month: number,
  extraClosedDays: string[] = [],
): number {
  const closed = new Set<string>([...Object.keys(HOLIDAYS), ...extraClosedDays]);
  const daysInMonth = new Date(year, month, 0).getDate();
  let count = 0;
  for (let d = 1; d <= daysInMonth; d++) {
    const ymd = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    if (!closed.has(ymd)) count++;
  }
  return Math.max(1, count);
}

export function currentMonthKey(date = new Date()): string {
  const { year, month } = getKSTParts(date);
  return `${year}-${String(month).padStart(2, '0')}`;
}

export function computeBusinessDaysForCurrentMonth(extraClosedDays: string[] = []): {
  monthKey: string;
  businessDays: number;
  year: number;
  month: number;
} {
  const { year, month } = getKSTParts();
  return {
    monthKey: currentMonthKey(),
    businessDays: countBusinessDaysInMonth(year, month, extraClosedDays),
    year,
    month,
  };
}
