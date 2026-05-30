/** KST(Asia/Seoul) 날짜 유틸 */

export function getKSTParts(date = new Date()) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const [y, m, d] = fmt.format(date).split('-').map(Number);
  return { year: y, month: m, day: d };
}

export function toYMDFromDate(date: Date): string {
  const { year, month, day } = getKSTParts(date);
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

export function getKSTTodayYMD(): string {
  return toYMDFromDate(new Date());
}

export function getKSTYesterdayYMD(): string {
  return addDaysYMD(getKSTTodayYMD(), -1);
}

export function getKSTNow(): Date {
  const { year, month, day } = getKSTParts();
  return new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T12:00:00+09:00`);
}

export function addDaysYMD(ymd: string, delta: number): string {
  const d = new Date(`${ymd}T12:00:00+09:00`);
  d.setDate(d.getDate() + delta);
  return toYMDFromDate(d);
}

export function subtractMonthsYMD(ymd: string, months: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  let ty = y;
  let tm = m - months;
  while (tm < 1) { tm += 12; ty -= 1; }
  const lastDay = new Date(ty, tm, 0).getDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(tm).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

export function subtractYearsYMD(ymd: string, years: number): string {
  const [y, m, d] = ymd.split('-').map(Number);
  const ty = y - years;
  const lastDay = new Date(ty, m, 0).getDate();
  const td = Math.min(d, lastDay);
  return `${ty}-${String(m).padStart(2, '0')}-${String(td).padStart(2, '0')}`;
}

/** 전월 동요일 */
export function getLastMonthSameDowYMD(ymd: string): string {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  const dow = base.getDay();
  const lastMonth = new Date(base);
  lastMonth.setMonth(lastMonth.getMonth() - 1);
  let diff = dow - lastMonth.getDay();
  if (Math.abs(diff) > 3) diff = diff > 0 ? diff - 7 : diff + 7;
  lastMonth.setDate(lastMonth.getDate() + diff);
  return toYMDFromDate(lastMonth);
}

/** 전년 동월 동요일 */
export function getLastYearSameDowYMD(ymd: string): string {
  const base = new Date(`${ymd}T12:00:00+09:00`);
  const dow = base.getDay();
  const lastYear = new Date(base);
  lastYear.setFullYear(lastYear.getFullYear() - 1);
  let diff = dow - lastYear.getDay();
  if (Math.abs(diff) > 3) diff = diff > 0 ? diff - 7 : diff + 7;
  lastYear.setDate(lastYear.getDate() + diff);
  return toYMDFromDate(lastYear);
}

export function monthRangeYMD(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  return { start, end, daysInMonth: lastDay };
}

/** 당월 평균용: KST 오늘까지 경과 일수 (과거 월은 월 전체 일수) */
export function avgDivisorForMonth(year: number, month: number): number {
  const kst = getKSTParts();
  const { daysInMonth } = monthRangeYMD(year, month);
  if (year === kst.year && month === kst.month) return kst.day;
  return daysInMonth;
}

/** YYYY-MM-DD 추출 (POS 다양한 날짜 형식) */
export function normDateYMD(raw: string): string {
  if (!raw) return '';
  const iso = raw.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const compact = raw.replace(/\D/g, '');
  if (compact.length >= 8) {
    return `${compact.slice(0, 4)}-${compact.slice(4, 6)}-${compact.slice(6, 8)}`;
  }
  return raw.slice(0, 10);
}

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'] as const;

export function getWeekdayKo(ymd: string): string {
  if (!ymd || ymd.length < 10) return '';
  const d = new Date(`${ymd.slice(0, 10)}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return '';
  return DOW_KO[d.getDay()] ?? '';
}

/** MM-DD(요일) */
export function formatDateShortWithDow(ymd: string): string {
  if (!ymd) return '';
  const dow = getWeekdayKo(ymd);
  return `${ymd.slice(5)}${dow ? `(${dow})` : ''}`;
}

/** YYYY-MM-DD(요일) */
export function formatDateWithDow(ymd: string): string {
  if (!ymd) return '';
  const dow = getWeekdayKo(ymd);
  return `${ymd}${dow ? `(${dow})` : ''}`;
}
