import {
  addDaysYMD,
  getLastMonthSameDowYMD,
  getLastYearSameDowYMD,
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
