import { addDaysYMD, formatDateShortWithDow, getKSTTodayYMD } from '@/lib/dateUtils';

export interface AbsenceEntry {
  name: string;
  tags: string[];
}

export interface DayAbsenceGroup {
  date: string;
  dayLabel: string;
  entries: AbsenceEntry[];
}

const LEAVE_LABELS: Record<string, string> = {
  annual: '연차',
  half_am: '반차(오전)',
  half_pm: '반차(오후)',
  unpaid: '무급',
};

const DAYOFF_LABELS: Record<string, string> = {
  regular: '휴무',
  substitute: '대휴',
  unpaid: '무급휴무',
};

export function leaveLabel(type: string) {
  return LEAVE_LABELS[type] || '연차';
}

export function dayoffLabel(type: string) {
  return DAYOFF_LABELS[type] || '휴무';
}

export function dateInRange(start: string, end: string, date: string) {
  return date >= start && date <= end;
}

/** 같은 날·같은 사람 태그 병합 */
export function mergeAbsenceEntries(
  raw: { name: string; tag: string }[],
): AbsenceEntry[] {
  const byName = new Map<string, Set<string>>();
  raw.forEach(({ name, tag }) => {
    if (!name) return;
    if (!byName.has(name)) byName.set(name, new Set());
    byName.get(name)!.add(tag);
  });
  return [...byName.entries()]
    .map(([name, tags]) => ({ name, tags: [...tags] }))
    .sort((a, b) => a.name.localeCompare(b.name, 'ko'));
}

export function buildTodayTomorrowGroups(
  todayEntries: AbsenceEntry[],
  tomorrowEntries: AbsenceEntry[],
): DayAbsenceGroup[] {
  const today = getKSTTodayYMD();
  const tomorrow = addDaysYMD(today, 1);
  return [
    { date: today, dayLabel: `오늘 ${formatDateShortWithDow(today)}`, entries: todayEntries },
    { date: tomorrow, dayLabel: `내일 ${formatDateShortWithDow(tomorrow)}`, entries: tomorrowEntries },
  ];
}
