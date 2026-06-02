import { HYGIENE_SECTIONS } from '@/lib/hygieneChecklist';

export type HygieneItemCell = { result: 'pass' | 'fail' | null; note: string };
export type HygieneItems = Record<string, HygieneItemCell>;

export function kstDateParts(now = new Date()) {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const hour = kst.getUTCHours();
  const minute = kst.getUTCMinutes();
  return {
    hour,
    minute,
    dateStr: kst.toISOString().slice(0, 10),
    totalMinutes: hour * 60 + minute,
  };
}

/** 11~14: 공통+작업전 / 14~20:30: +작업중 / 20:30~: +작업후 */
export function getAutoFillSectionIndices(totalMinutes: number): number[] {
  if (totalMinutes < 11 * 60) return [];
  if (totalMinutes < 14 * 60) return [0, 1];
  if (totalMinutes < 20 * 60 + 30) return [0, 1, 2];
  return [0, 1, 2, 3];
}

export function shouldFinalSaveOnEntry(totalMinutes: number): boolean {
  return totalMinutes >= 20 * 60 + 30;
}

export function buildItemsWithSections(
  existing: HygieneItems,
  sectionIndices: number[],
): HygieneItems {
  const items: HygieneItems = { ...existing };
  for (const si of sectionIndices) {
    const section = HYGIENE_SECTIONS[si];
    if (!section) continue;
    section.items.forEach((_, ii) => {
      const key = `${si}_${ii}`;
      items[key] = {
        result: 'pass',
        note: existing[key]?.note || '',
      };
    });
  }
  return items;
}

export function countItemsStats(items: HygieneItems) {
  let totalItems = 0;
  let passedItems = 0;
  let unchecked = 0;
  HYGIENE_SECTIONS.forEach((section, si) => {
    section.items.forEach((_, ii) => {
      totalItems++;
      const cell = items[`${si}_${ii}`];
      if (cell?.result === 'pass') passedItems++;
      else if (cell?.result == null) unchecked++;
    });
  });
  return { totalItems, passedItems, unchecked };
}

export function hasSectionsComplete(items: HygieneItems, sectionIndices: number[]): boolean {
  return sectionIndices.every(si => {
    const section = HYGIENE_SECTIONS[si];
    return section.items.every((_, ii) => items[`${si}_${ii}`]?.result === 'pass');
  });
}

export type ReminderKind = 'morning' | 'midday' | 'closing';

const REMINDER_KINDS = new Set<ReminderKind>(['morning', 'midday', 'closing']);

export function parseReminderKindParam(value: string | null): ReminderKind | null {
  const v = (value || '').trim() as ReminderKind;
  return REMINDER_KINDS.has(v) ? v : null;
}

/**
 * cron 실행 시각(KST)에 맞는 알림 종류.
 * Vercel Hobby ±59분 오차 대비 — 목표 시각 전후 넓은 창 사용.
 * GitHub Actions 등에서는 ?kind=morning|midday|closing 로 강제 지정.
 */
export function getReminderKind(hour: number, minute: number): ReminderKind | null {
  // 11:00 KST (작업전) — 10:30~12:14
  if (hour === 10 && minute >= 30) return 'morning';
  if (hour === 11) return 'morning';
  if (hour === 12 && minute < 15) return 'morning';

  // 14:00 KST (작업중) — 13:30~15:14
  if (hour === 13 && minute >= 30) return 'midday';
  if (hour === 14) return 'midday';
  if (hour === 15 && minute < 15) return 'midday';

  // 20:30 KST (마감) — 20:00~21:29
  if (hour === 20 && minute >= 0) return 'closing';
  if (hour === 21 && minute < 30) return 'closing';

  return null;
}

export function needsHygieneReminder(
  record: { items?: HygieneItems; saveType?: string } | null,
  kind: ReminderKind,
): boolean {
  const items = (record?.items || {}) as HygieneItems;
  switch (kind) {
    case 'morning':
      return !hasSectionsComplete(items, [0, 1]);
    case 'midday':
      return !hasSectionsComplete(items, [0, 1, 2]);
    case 'closing':
      return record?.saveType !== 'final' || !hasSectionsComplete(items, [0, 1, 2, 3]);
  }
}

export const REMINDER_MESSAGES: Record<ReminderKind, { title: string; message: string }> = {
  morning: {
    title: '🧹 위생점검 알림',
    message: '개인위생(공통)·작업전 점검이 필요합니다. 위생점검일지 화면에 들어가면 자동으로 반영됩니다.',
  },
  midday: {
    title: '🧹 위생점검 알림',
    message: '작업중 점검까지 필요합니다. 위생점검일지 화면에 들어가면 자동으로 반영됩니다.',
  },
  closing: {
    title: '🧹 위생점검 마감 알림',
    message: '작업후 점검·최종저장이 필요합니다. 20:30 이후 화면 진입 시 최종 반영됩니다.',
  },
};

export function sectionLabels(indices: number[]): string {
  return indices.map(i => HYGIENE_SECTIONS[i]?.category).filter(Boolean).join(', ');
}
