import { adminDb } from '@/lib/firebase/admin';
import { HOLIDAYS } from '@/components/calendar/CalendarTypes';
import { addDaysYMD, getKSTTodayYMD, getWeekdayKo } from '@/lib/dateUtils';
import {
  dateInRange,
  dayoffLabel,
  leaveLabel,
  mergeAbsenceEntries,
} from '@/lib/hr/absenceSchedule';

const DOW_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function ymdToLocdate(ymd: string) {
  return ymd.replace(/-/g, '');
}

function staticHolidayLocdates(): string[] {
  return Object.keys(HOLIDAYS).map(ymdToLocdate);
}

function holidayLabel(ymd: string): string | null {
  return HOLIDAYS[ymd] || null;
}

async function fetchPublicHolidayLocdates(apiKey: string, months: string[]): Promise<string[]> {
  if (!apiKey) return [];
  const out: string[] = [];
  for (const ym of months) {
    try {
      const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${apiKey}&solYear=${ym.slice(0, 4)}&solMonth=${ym.slice(4, 6)}&numOfRows=50&pageNo=1&_type=json`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const items = j?.response?.body?.items?.item || [];
      (Array.isArray(items) ? items : [items]).forEach((i: { locdate: string | number }) => {
        out.push(String(i.locdate));
      });
    } catch { /* skip */ }
  }
  return out;
}

/** 공공 API + 내장 캘린더(선거 임시공휴 등) 병합 */
export async function resolvePredictionHolidaySet(
  apiKey: string,
  todayYmd = getKSTTodayYMD(),
): Promise<Set<string>> {
  const tomorrow = addDaysYMD(todayYmd, 1);
  const months = new Set([
    todayYmd.replace(/-/g, '').slice(0, 6),
    tomorrow.replace(/-/g, '').slice(0, 6),
  ]);
  const apiDates = await fetchPublicHolidayLocdates(apiKey, [...months]);
  return new Set([...apiDates, ...staticHolidayLocdates()]);
}

export function getHolidayInfoForDate(ymd: string, holidaySet: Set<string>): {
  isHoliday: boolean;
  label: string | null;
} {
  const loc = ymdToLocdate(ymd);
  const label = holidayLabel(ymd);
  const isHoliday = holidaySet.has(loc) || Boolean(label);
  return { isHoliday, label: label || (isHoliday ? '공휴일' : null) };
}

/** 비교 기준일 목록용 공휴일·기념일 집합 (해당 월 API + 내장 캘린더) */
export async function resolveHolidaySetForYmdList(
  apiKey: string,
  ymdList: string[],
): Promise<Set<string>> {
  const months = new Set<string>();
  ymdList.forEach(ymd => {
    if (!ymd || ymd.length < 7) return;
    months.add(ymd.replace(/-/g, '').slice(0, 6));
    const prev = addDaysYMD(ymd, -1).replace(/-/g, '').slice(0, 6);
    const next = addDaysYMD(ymd, 1).replace(/-/g, '').slice(0, 6);
    months.add(prev);
    months.add(next);
  });
  const apiDates = await fetchPublicHolidayLocdates(apiKey, [...months]);
  return new Set([...apiDates, ...staticHolidayLocdates()]);
}

/**
 * 계산 근거용 — YYYY-MM-DD(요일)·휴일/기념일명
 * @example "전주동요일 2026-05-26(월요일)·부처님오신날"
 */
export function formatBenchmarkDateLabel(
  ymd: string,
  holidaySet: Set<string>,
  roleLabel?: string,
): string {
  const dow = getWeekdayKo(ymd);
  const { label: holidayName } = getHolidayInfoForDate(ymd, holidaySet);
  const cal = `${ymd}(${dow}요일)`;
  const suffix = holidayName ? `·${holidayName}` : '';
  return roleLabel ? `${roleLabel} ${cal}${suffix}` : `${cal}${suffix}`;
}

export async function fetchStoreAbsenceSummary(
  storeId: string,
  todayYmd = getKSTTodayYMD(),
): Promise<{ today: string[]; tomorrow: string[] }> {
  const tomorrow = addDaysYMD(todayYmd, 1);
  if (!storeId) return { today: [], tomorrow: [] };

  const [leaveSnap, dayoffSnap, empSnap] = await Promise.all([
    adminDb.collection('hr_leave_requests').where('storeId', '==', storeId).get().catch(() => null),
    adminDb.collection('hr_dayoff_requests').where('storeId', '==', storeId).get().catch(() => null),
    adminDb.collection('hr_employees').where('storeId', '==', storeId).get().catch(() => null),
  ]);

  const rawToday: { name: string; tag: string }[] = [];
  const rawTomorrow: { name: string; tag: string }[] = [];

  leaveSnap?.docs.forEach(doc => {
    const l = doc.data();
    if (l.status !== 'approved' || !l.userName || !l.startDate || !l.endDate) return;
    const tag = leaveLabel(String(l.type || 'annual'));
    if (dateInRange(l.startDate, l.endDate, todayYmd)) rawToday.push({ name: l.userName, tag });
    if (dateInRange(l.startDate, l.endDate, tomorrow)) rawTomorrow.push({ name: l.userName, tag });
  });

  dayoffSnap?.docs.forEach(doc => {
    const d = doc.data();
    if (d.status !== 'approved' || !d.userName || !Array.isArray(d.dates)) return;
    const tag = dayoffLabel(String(d.type || 'regular'));
    if (d.dates.includes(todayYmd)) rawToday.push({ name: d.userName, tag });
    if (d.dates.includes(tomorrow)) rawTomorrow.push({ name: d.userName, tag });
  });

  const dowToday = getWeekdayKo(todayYmd);
  const dowTomorrow = getWeekdayKo(tomorrow);
  empSnap?.docs.forEach(doc => {
    const emp = doc.data();
    if (emp.status === '퇴사' || !emp.name) return;
    const daysOff: string[] = emp.daysOff || ['토', '일'];
    if (daysOff.includes(dowToday)) rawToday.push({ name: emp.name, tag: '정기휴무' });
    if (daysOff.includes(dowTomorrow)) rawTomorrow.push({ name: emp.name, tag: '정기휴무' });
  });

  const fmt = (entries: ReturnType<typeof mergeAbsenceEntries>) =>
    entries.map(e => `${e.name}(${e.tags.join('/')})`);

  return {
    today: fmt(mergeAbsenceEntries(rawToday)),
    tomorrow: fmt(mergeAbsenceEntries(rawTomorrow)),
  };
}

export interface PredictionScheduleContext {
  todayYmd: string;
  tomorrowYmd: string;
  todayDow: string;
  tomorrowDow: string;
  todayHoliday: { isHoliday: boolean; label: string | null };
  tomorrowHoliday: { isHoliday: boolean; label: string | null };
  absenceToday: string[];
  absenceTomorrow: string[];
  contextLines: string[];
  scheduleBlock: string;
}

export async function buildPredictionScheduleContext(
  storeId: string,
  apiKey: string,
  todayYmd = getKSTTodayYMD(),
): Promise<PredictionScheduleContext> {
  const tomorrowYmd = addDaysYMD(todayYmd, 1);
  const holidaySet = await resolvePredictionHolidaySet(apiKey, todayYmd);
  const todayHoliday = getHolidayInfoForDate(todayYmd, holidaySet);
  const tomorrowHoliday = getHolidayInfoForDate(tomorrowYmd, holidaySet);
  const absence = await fetchStoreAbsenceSummary(storeId, todayYmd);

  const todayDow = DOW_NAMES[new Date(`${todayYmd}T12:00:00+09:00`).getDay()];
  const tomorrowDow = DOW_NAMES[new Date(`${tomorrowYmd}T12:00:00+09:00`).getDay()];

  const contextLines: string[] = [
    `오늘 ${todayYmd}(${todayDow})${todayHoliday.label ? ` — ${todayHoliday.label}` : todayHoliday.isHoliday ? ' — 공휴일' : ''}`,
    `내일 ${tomorrowYmd}(${tomorrowDow})${tomorrowHoliday.label ? ` — **${tomorrowHoliday.label}**` : tomorrowHoliday.isHoliday ? ' — 공휴일' : ''}`,
  ];

  if (absence.today.length) {
    contextLines.push(`오늘 매장 휴무·결원: ${absence.today.join(', ')}`);
  }
  if (absence.tomorrow.length) {
    contextLines.push(`내일 매장 휴무·결원: ${absence.tomorrow.join(', ')}`);
  }

  if (tomorrowHoliday.isHoliday && tomorrowHoliday.label) {
    contextLines.push(
      `내일 ${tomorrowHoliday.label}로 유동인구·소비패턴 변동 가능 — 전주 동요일·유사 공휴일 매출을 참고해 발주·진열 조정 권장`,
    );
  }

  const scheduleBlock = contextLines.join('\n');

  return {
    todayYmd,
    tomorrowYmd,
    todayDow,
    tomorrowDow,
    todayHoliday,
    tomorrowHoliday,
    absenceToday: absence.today,
    absenceTomorrow: absence.tomorrow,
    contextLines,
    scheduleBlock,
  };
}
