import { HOLIDAYS } from '@/components/calendar/CalendarTypes';

/** 휴일발주알림: 휴일 2일 전(당일 발주 → 익일 수령) */
export const HOLIDAY_ORDER_ALERT_DAYS_BEFORE = 2;
export const HOLIDAY_ORDER_ALERT_LEAD_DAYS = [7, HOLIDAY_ORDER_ALERT_DAYS_BEFORE] as const;
export const HOLIDAY_ORDER_ALERT_TYPE = '휴일발주알림' as const;

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

function compactYmdToIso(ymd: string): string {
  const s = String(ymd || '').replace(/\D/g, '');
  if (s.length !== 8) return ymd;
  return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
}

export function daysBetweenCompactYmd(fromCompact: string, toCompact: string): number {
  return daysUntil(compactYmdToIso(fromCompact), compactYmdToIso(toCompact));
}

export function buildHolidayOrderAlertMessage(holidayDateCompact: string, label?: string): string {
  const display = label || compactYmdToIso(holidayDateCompact);
  return `모레(${display}) 휴일입니다. 오늘 발주 시 내일 수령 가능 — 발주 추가점검해주세요.`;
}

/** 공휴일 API(YYYYMMDD) 기준 — 휴일발주알림 발생 여부 */
export function resolveHolidayOrderAlert(
  todayCompact: string,
  holidayDatesCompact: string[],
): { holidayDate: string; daysUntil: number; message: string } | null {
  const today = String(todayCompact || '').replace(/\D/g, '');
  const next = [...new Set(holidayDatesCompact.map(h => String(h).replace(/\D/g, '')))]
    .filter(h => h.length === 8 && h > today)
    .sort()[0];
  if (!next) return null;

  const daysUntilHoliday = daysBetweenCompactYmd(today, next);
  if (daysUntilHoliday !== HOLIDAY_ORDER_ALERT_DAYS_BEFORE) return null;

  return {
    holidayDate: next,
    daysUntil: daysUntilHoliday,
    message: buildHolidayOrderAlertMessage(next),
  };
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
  if (daysBefore === HOLIDAY_ORDER_ALERT_DAYS_BEFORE) {
    return buildHolidayOrderAlertMessage(period.startDate.replace(/-/g, ''), label);
  }
  if (daysBefore === 7) {
    return `1주일 후 ${label} 휴일입니다. 발주 추가점검해주세요.`;
  }
  return `${daysBefore}일 후 ${label} 휴일입니다. 발주 추가점검해주세요.`;
}
