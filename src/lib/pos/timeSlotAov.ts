export type TimeSlotKey = 'morning' | 'afternoon' | 'evening' | 'night';

export interface TimeSlotAovRow {
  key: TimeSlotKey;
  label: string;
  hourRange: string;
  totalSales: number;
  tranCount: number;
  avgTicket: number | null;
}

const SLOT_DEFS: { key: TimeSlotKey; label: string; hourRange: string; from: number; to: number }[] = [
  { key: 'morning', label: '오전', hourRange: '09:00~12:00', from: 9, to: 11 },
  { key: 'afternoon', label: '오후', hourRange: '12:00~18:00', from: 12, to: 17 },
  { key: 'evening', label: '저녁', hourRange: '18:00~21:00', from: 18, to: 20 },
  { key: 'night', label: '야간', hourRange: '21:00~', from: 21, to: 23 },
];

function parseHour(time?: string): number | null {
  const digits = String(time || '').replace(/\D/g, '');
  if (digits.length >= 2) {
    const h = parseInt(digits.slice(0, 2), 10);
    return Number.isFinite(h) ? h : null;
  }
  return null;
}

function slotForHour(hour: number): TimeSlotKey {
  if (hour >= 9 && hour <= 11) return 'morning';
  if (hour >= 12 && hour <= 17) return 'afternoon';
  if (hour >= 18 && hour <= 20) return 'evening';
  return 'night';
}

export function calcTimeSlotAovFromHourly(
  timeSlots: Array<{ hour?: string; totalSale?: number; tranCount?: number }>,
): { slots: TimeSlotAovRow[]; insight: string | null } {
  const totals: Record<TimeSlotKey, { total: number; count: number }> = {
    morning: { total: 0, count: 0 },
    afternoon: { total: 0, count: 0 },
    evening: { total: 0, count: 0 },
    night: { total: 0, count: 0 },
  };

  for (const row of timeSlots || []) {
    const hour = parseHour(row.hour);
    if (hour == null) continue;
    const key = slotForHour(hour);
    totals[key].total += Number(row.totalSale || 0);
    totals[key].count += Number(row.tranCount || 0);
  }

  const slots: TimeSlotAovRow[] = SLOT_DEFS.map(def => {
    const t = totals[def.key];
    return {
      key: def.key,
      label: def.label,
      hourRange: def.hourRange,
      totalSales: t.total,
      tranCount: t.count,
      avgTicket: t.count > 0 ? Math.round(t.total / t.count) : null,
    };
  });

  const afternoon = slots.find(s => s.key === 'afternoon');
  const night = slots.find(s => s.key === 'night');
  let insight: string | null = null;
  if (afternoon?.avgTicket && night?.avgTicket && afternoon.avgTicket > 0 && night.tranCount >= 3) {
    const diff = Math.round(((night.avgTicket - afternoon.avgTicket) / afternoon.avgTicket) * 100);
    if (Math.abs(diff) >= 5) {
      insight = diff > 0
        ? `야간 객단가가 오후 대비 ${diff}% 높음`
        : `야간 객단가가 오후 대비 ${Math.abs(diff)}% 낮음`;
    }
  }

  return { slots, insight };
}

export function calcTimeSlotAovFromItems(
  items: Array<{ time?: string; amount?: number; netSales?: number }>,
): { slots: TimeSlotAovRow[]; insight: string | null } {
  const hourly: Array<{ hour?: string; totalSale?: number; tranCount?: number }> = [];
  const byHour = new Map<string, { total: number; count: number }>();
  for (const it of items || []) {
    const hour = parseHour(it.time);
    if (hour == null) continue;
    const key = String(hour).padStart(2, '0');
    const prev = byHour.get(key) || { total: 0, count: 0 };
    prev.total += Number(it.netSales ?? it.amount ?? 0);
    prev.count += 1;
    byHour.set(key, prev);
  }
  for (const [hour, v] of byHour) {
    hourly.push({ hour, totalSale: v.total, tranCount: v.count });
  }
  return calcTimeSlotAovFromHourly(hourly);
}
