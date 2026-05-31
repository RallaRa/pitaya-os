import { HOLIDAYS } from '@/components/calendar/CalendarTypes';

export interface HolidayPeriod {
  startDate: string;
  endDate: string;
  names: string[];
}

function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getHolidayPeriods(): HolidayPeriod[] {
  const entries = Object.entries(HOLIDAYS).sort(([a], [b]) => a.localeCompare(b));
  const periods: HolidayPeriod[] = [];
  let current: HolidayPeriod | null = null;

  for (const [date, name] of entries) {
    if (!current) {
      current = { startDate: date, endDate: date, names: [name] };
      continue;
    }

    const prev = new Date(`${current.endDate}T12:00:00`);
    const next = new Date(`${date}T12:00:00`);
    const diffDays = Math.round((next.getTime() - prev.getTime()) / 86400000);

    if (diffDays === 1) {
      current.endDate = date;
      if (!current.names.includes(name)) current.names.push(name);
    } else {
      periods.push(current);
      current = { startDate: date, endDate: date, names: [name] };
    }
  }

  if (current) periods.push(current);
  return periods;
}

export function daysUntil(fromDateStr: string, toDateStr: string): number {
  const from = new Date(`${fromDateStr}T12:00:00`);
  const to = new Date(`${toDateStr}T12:00:00`);
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

export function formatHolidayPeriodLabel(period: HolidayPeriod): string {
  const uniqueNames = [...new Set(period.names)];
  const namePart = uniqueNames.slice(0, 3).join(', ');
  if (period.startDate === period.endDate) {
    return `${period.startDate} (${namePart})`;
  }
  return `${period.startDate}~${period.endDate} (${namePart})`;
}

export function getUpcomingHolidayAlerts(todayStr: string, leadDays: number[]) {
  const alerts: Array<{ period: HolidayPeriod; daysBefore: number; label: string }> = [];

  for (const period of getHolidayPeriods()) {
    const until = daysUntil(todayStr, period.startDate);
    if (leadDays.includes(until)) {
      alerts.push({
        period,
        daysBefore: until,
        label: formatHolidayPeriodLabel(period),
      });
    }
  }

  return alerts;
}

export function kstTodayStr(): string {
  const kst = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return toDateStr(kst);
}

export function holidayAlertMessage(period: HolidayPeriod, daysBefore: number): string {
  const label = formatHolidayPeriodLabel(period);
  const prefix =
    daysBefore === 7 ? '1주일 후 ' :
    daysBefore === 2 ? '2일 후 ' :
    `${daysBefore}일 후 `;
  return `${prefix}${label} 휴일입니다. 발주 추가점검해주세요.`;
}
