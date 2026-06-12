import type { HygieneItems } from '@/lib/hygieneSchedule';
import { hasSectionsComplete } from '@/lib/hygieneSchedule';

export type HygieneSlotKind = 'morning' | 'midday' | 'closing';

export interface HygieneSlotTemplate {
  kind: HygieneSlotKind;
  label: string;
  specItemCount: number;
  dueHour: number;
  dueMinute: number;
  /** HYGIENE_SECTIONS 인덱스 */
  sectionIndices: number[];
  followupMinutes: number;
}

export const HYGIENE_SLOT_TEMPLATES: HygieneSlotTemplate[] = [
  {
    kind: 'morning',
    label: '아침 점검',
    specItemCount: 10,
    dueHour: 11,
    dueMinute: 0,
    sectionIndices: [0, 1],
    followupMinutes: 30,
  },
  {
    kind: 'midday',
    label: '오후 점검',
    specItemCount: 5,
    dueHour: 14,
    dueMinute: 0,
    sectionIndices: [2],
    followupMinutes: 30,
  },
  {
    kind: 'closing',
    label: '마감 점검',
    specItemCount: 8,
    dueHour: 20,
    dueMinute: 30,
    sectionIndices: [3],
    followupMinutes: 30,
  },
];

export interface HygieneSlotStatus {
  kind: HygieneSlotKind;
  label: string;
  complete: boolean;
  dueAt: string;
  overdue: boolean;
  completedAt?: string;
  inspectorName?: string;
}

export function slotDueTotalMinutes(slot: HygieneSlotTemplate): number {
  return slot.dueHour * 60 + slot.dueMinute;
}

export function isSlotFollowupWindow(
  slot: HygieneSlotTemplate,
  totalMinutesKst: number,
): boolean {
  const start = slotDueTotalMinutes(slot) + slot.followupMinutes;
  const end = start + 90;
  return totalMinutesKst >= start && totalMinutesKst < end;
}

export function isSlotOverdue(
  slot: HygieneSlotTemplate,
  totalMinutesKst: number,
): boolean {
  return totalMinutesKst >= slotDueTotalMinutes(slot) + slot.followupMinutes;
}

export function buildSlotStatuses(
  record: {
    items?: HygieneItems;
    saveType?: string;
    slotCompletedAt?: Record<string, string>;
    inspectorName?: string;
  } | null,
  dateYmd: string,
): HygieneSlotStatus[] {
  const items = (record?.items || {}) as HygieneItems;
  return HYGIENE_SLOT_TEMPLATES.map(slot => {
    const complete = slot.kind === 'closing'
      ? record?.saveType === 'final' && hasSectionsComplete(items, slot.sectionIndices)
      : hasSectionsComplete(items, slot.sectionIndices);
    const dueAt = `${dateYmd}T${String(slot.dueHour).padStart(2, '0')}:${String(slot.dueMinute).padStart(2, '0')}:00+09:00`;
    return {
      kind: slot.kind,
      label: slot.label,
      complete,
      dueAt,
      overdue: false,
      completedAt: record?.slotCompletedAt?.[slot.kind],
      inspectorName: record?.inspectorName,
    };
  });
}

export interface HygieneMonthlySummary {
  month: string;
  totalDays: number;
  completedDays: number;
  partialDays: number;
  failDays: number;
  completionRate: number;
  slotCompletionRates: Record<HygieneSlotKind, number>;
}

export function summarizeHygieneMonth(
  month: string,
  records: Array<{ checkDate: string; status?: string; items?: HygieneItems; saveType?: string }>,
): HygieneMonthlySummary {
  const inMonth = records.filter(r => r.checkDate?.startsWith(month));
  let completedDays = 0;
  let partialDays = 0;
  let failDays = 0;
  const slotDone: Record<HygieneSlotKind, number> = { morning: 0, midday: 0, closing: 0 };

  for (const rec of inMonth) {
    const items = (rec.items || {}) as HygieneItems;
    if (rec.status === 'pass' || rec.saveType === 'final') completedDays++;
    else if (rec.status === 'partial') partialDays++;
    else failDays++;

    for (const slot of HYGIENE_SLOT_TEMPLATES) {
      const ok = slot.kind === 'closing'
        ? rec.saveType === 'final' && hasSectionsComplete(items, slot.sectionIndices)
        : hasSectionsComplete(items, slot.sectionIndices);
      if (ok) slotDone[slot.kind]++;
    }
  }

  const totalDays = inMonth.length;
  return {
    month,
    totalDays,
    completedDays,
    partialDays,
    failDays,
    completionRate: totalDays > 0 ? Math.round((completedDays / totalDays) * 1000) / 10 : 0,
    slotCompletionRates: {
      morning: totalDays > 0 ? Math.round((slotDone.morning / totalDays) * 1000) / 10 : 0,
      midday: totalDays > 0 ? Math.round((slotDone.midday / totalDays) * 1000) / 10 : 0,
      closing: totalDays > 0 ? Math.round((slotDone.closing / totalDays) * 1000) / 10 : 0,
    },
  };
}
