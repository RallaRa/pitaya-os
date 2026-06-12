import {
  addDaysYMD,
  formatDateShortWithDow,
  getLastMonthSameDowYMD,
  getLastYearSameDowYMD,
  getWeekdayKo,
  subtractMonthsYMD,
  subtractYearsYMD,
} from '@/lib/dateUtils';

export type CompareKey =
  | 'today'
  | 'yesterday'
  | 'lastMonthSame'
  | 'lastMonthDow'
  | 'lastWeekDow'
  | 'lastYearMonthSame'
  | 'lastYearMonthDow';

export const COMPARE_COLUMNS: { key: CompareKey; label: string; color: string }[] = [
  { key: 'today',             label: '금일',           color: 'text-blue-400' },
  { key: 'yesterday',         label: '전일',           color: 'text-slate-300' },
  { key: 'lastMonthSame',     label: '전월동일',       color: 'text-lime-400' },
  { key: 'lastMonthDow',      label: '전월동요일',     color: 'text-lime-300' },
  { key: 'lastWeekDow',       label: '전주동요일',     color: 'text-yellow-400' },
  { key: 'lastYearMonthSame', label: '전년동월동일',   color: 'text-orange-400' },
  { key: 'lastYearMonthDow',  label: '전년동월동요일', color: 'text-orange-300' },
];

export function getCompareDates(baseDate: string): Record<CompareKey, string> {
  return {
    today:             baseDate,
    yesterday:         addDaysYMD(baseDate, -1),
    lastMonthSame:     subtractMonthsYMD(baseDate, 1),
    lastMonthDow:      getLastMonthSameDowYMD(baseDate),
    lastWeekDow:       addDaysYMD(baseDate, -7),
    lastYearMonthSame: subtractYearsYMD(baseDate, 1),
    lastYearMonthDow:  getLastYearSameDowYMD(baseDate),
  };
}

/** MM-DD 또는 YYYY-MM-DD */
export function formatCompareDate(ymd: string, fullYear = false): string {
  if (fullYear) return ymd;
  return ymd.slice(5);
}

/** YYYY-MM-DD(요) — 비교 기준일 표시용 */
export function formatCompareDateLabel(ymd: string): string {
  if (!ymd) return '';
  const dow = getWeekdayKo(ymd);
  return `${ymd.slice(0, 10)}${dow ? `(${dow})` : ''}`;
}

/** 컬럼 헤더: "전일 05-28(수)" */
export function getCompareColumnLabel(key: CompareKey, baseDate: string): string {
  const col = COMPARE_COLUMNS.find(c => c.key === key);
  if (!col) return key;
  const dates = getCompareDates(baseDate);
  return `${col.label} ${formatCompareDateLabel(dates[key])}`;
}

/** 객단가 (순매출 ÷ 객수) */
export function calcAvgTicket(netSales?: number | null, customerCount?: number | null): number | null {
  if (customerCount == null || customerCount <= 0 || netSales == null) return null;
  return Math.round(netSales / customerCount);
}

export { getWeekdayKo, formatDateShortWithDow };

/** 기간 검색용 — 각 비교 키의 날짜 범위 */
export function getCompareDateRanges(
  rangeStart: string,
  rangeEnd: string,
): Record<Exclude<CompareKey, 'today'>, { start: string; end: string }> {
  const startDates = getCompareDates(rangeStart);
  const endDates = getCompareDates(rangeEnd);
  const keys = COMPARE_COLUMNS.map(c => c.key).filter((k): k is Exclude<CompareKey, 'today'> => k !== 'today');
  return Object.fromEntries(
    keys.map(k => [k, { start: startDates[k], end: endDates[k] }]),
  ) as Record<Exclude<CompareKey, 'today'>, { start: string; end: string }>;
}

/** 여러 기준일의 비교 대상 날짜 min~max (한 번에 fetch) */
export function getComparisonFetchBounds(dates: string[]): { start: string; end: string } | null {
  if (!dates.length) return null;
  const all: string[] = [];
  for (const d of dates) {
    const cmp = getCompareDates(d);
    Object.entries(cmp).forEach(([k, v]) => {
      if (k !== 'today') all.push(v);
    });
  }
  all.sort();
  return { start: all[0], end: all[all.length - 1] };
}

export function calcChange(current: number, prev?: number | null) {
  if (prev == null || prev === 0) return null;
  const pct = ((current - prev) / prev) * 100;
  return {
    pct,
    label: `${pct > 0 ? '+' : ''}${pct.toFixed(1)}%${pct > 0 ? '↑' : pct < 0 ? '↓' : ''}`,
    color: pct > 0 ? 'text-emerald-400' : pct < 0 ? 'text-red-400' : 'text-slate-500',
  };
}

export function dailyReportDocId(storeId: string, date: string) {
  return `pos_${storeId}_${date}`;
}

/** daily_reports 중복 문서 선택 (POS bridge 우선) */
export function scoreDailyReport(dr: { source?: string; totalSales?: number | null }): number {
  const s = dr.totalSales || 0;
  if (dr.source === 'pos_bridge' && s > 0) return Infinity;
  if (dr.source === 'pos_bridge' && s === 0) return -1;
  return s;
}

export function pickBestDailyReport<T extends { storeId?: string; reportDate?: string; source?: string; totalSales?: number | null }>(
  docs: T[],
  storeId: string,
  date: string,
): T | null {
  let best: T | null = null;
  for (const d of docs) {
    if (d.storeId !== storeId || d.reportDate !== date) continue;
    if (!best || scoreDailyReport(d) > scoreDailyReport(best)) best = d;
  }
  return best;
}

export function netSalesFromDailyReport(d: Record<string, unknown>): number {
  const totalSales = (d.totalSales as number | undefined) ?? 0;
  const netSales = d.netSales as number | undefined;
  const netSale = d.netSale as number | undefined;
  if (netSales != null && netSales !== 0) return netSales;
  if (netSale != null && netSale !== 0) return netSale;
  return totalSales - ((d.returnAmount as number | undefined) ?? 0) - ((d.discountAmount as number | undefined) ?? 0);
}

export interface DailyReportView extends ReportSnapshot {
  isClosed?: boolean;
  weather?: { condition?: string; tempMin?: number; tempMax?: number } | string | null;
  issues?: Array<{ title?: string }> | string | null;
  news?: { title?: string; description?: string } | null;
}

export function mapDailyReportDoc(d: Record<string, unknown>): DailyReportView {
  return {
    totalSales: (d.totalSales as number | undefined) ?? 0,
    netSales: netSalesFromDailyReport(d),
    customerCount: (d.customerCount as number | undefined) ?? 0,
    returnAmount: (d.returnAmount as number | undefined) ?? 0,
    cashSale: (d.cashSale as number | undefined) ?? 0,
    cardSale: (d.cardSale as number | undefined) ?? 0,
    posBreakdown: d.posBreakdown as ReportSnapshot['posBreakdown'],
    items: d.items as ReportSnapshot['items'],
    timeSlots: d.timeSlots as ReportSnapshot['timeSlots'],
    isClosed: d.isClosed as boolean | undefined,
    weather: (d.weather ?? null) as DailyReportView['weather'],
    issues: (d.issues ?? null) as DailyReportView['issues'],
    news: (d.news ?? null) as DailyReportView['news'],
  };
}

export interface ReportSnapshot {
  totalSales?: number;
  netSales?: number;
  customerCount?: number;
  returnAmount?: number;
  cashSale?: number;
  cardSale?: number;
  posBreakdown?: Record<string, { totalSale?: number; netSale?: number }> | Array<{ posNo: string; totalSale?: number; netSale?: number }>;
  items?: Array<{ name?: string; amount?: number; netSales?: number; qty?: number; categoryName?: string; time?: string }>;
  timeSlots?: Array<{ hour: string; posNo?: string; totalSale?: number; tranCount?: number }>;
}

export function normalizePosBreakdown(raw: ReportSnapshot['posBreakdown']): Record<string, number> {
  const out: Record<string, number> = {};
  if (!raw) return out;
  if (Array.isArray(raw)) {
    raw.forEach(p => {
      const key = `POS${String(p.posNo || '').padStart(2, '0')}`.replace('POSPOS', 'POS');
      out[key] = p.netSale ?? p.totalSale ?? 0;
    });
    return out;
  }
  Object.entries(raw).forEach(([k, v]) => {
    out[k] = v.netSale ?? v.totalSale ?? 0;
  });
  return out;
}

const TIME_RANGES = [
  { label: '오전(09-12)', from: 9, to: 12 },
  { label: '점심(12-14)', from: 12, to: 14 },
  { label: '오후(14-18)', from: 14, to: 18 },
  { label: '저녁(18-21)', from: 18, to: 21 },
  { label: '야간(21-)', from: 21, to: 24 },
];

export function aggregateTimeSlotsFromItems(
  items: ReportSnapshot['items'],
  posBreakdown?: ReportSnapshot['posBreakdown'],
) {
  if (!items?.length) return [];

  type Slot = { label: string; pos: Record<string, number>; total: number; count: number };
  const slots: Slot[] = TIME_RANGES.map(r => ({ label: r.label, pos: {}, total: 0, count: 0 }));

  for (const item of items) {
    const time = item.time || '';
    const hour = parseInt(time.split(':')[0] || '', 10);
    if (Number.isNaN(hour)) continue;
    const slot = TIME_RANGES.find(r => hour >= r.from && hour < r.to);
    if (!slot) continue;
    const idx = TIME_RANGES.indexOf(slot);
    const amt = item.netSales ?? item.amount ?? 0;
    slots[idx].total += amt;
    slots[idx].count += item.qty ?? 1;
  }

  const posKeys = Object.keys(normalizePosBreakdown(posBreakdown));
  if (posKeys.length === 0 && slots.every(s => s.total === 0)) return [];

  return slots.map(s => ({
    label: s.label,
    total: s.total,
    count: s.count,
    pos: s.pos,
  }));
}

export function topItems(items: ReportSnapshot['items'], limit = 20) {
  const map = new Map<string, { name: string; amount: number; qty: number; category: string }>();
  for (const it of items || []) {
    const name = it.name || '미상';
    const prev = map.get(name) || { name, amount: 0, qty: 0, category: it.categoryName || '' };
    prev.amount += it.netSales ?? it.amount ?? 0;
    prev.qty += it.qty ?? 1;
    map.set(name, prev);
  }
  return [...map.values()].sort((a, b) => b.amount - a.amount).slice(0, limit);
}
