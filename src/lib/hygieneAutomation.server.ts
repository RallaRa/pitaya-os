import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import {
  buildSlotStatuses,
  HYGIENE_SLOT_TEMPLATES,
  isSlotFollowupWindow,
  isSlotOverdue,
  summarizeHygieneMonth,
  type HygieneMonthlySummary,
  type HygieneSlotKind,
  type HygieneSlotStatus,
} from '@/lib/hygieneTemplates';
import { hasSectionsComplete, kstDateParts, type HygieneItems } from '@/lib/hygieneSchedule';
import { ensureTasksChannel, postMessengerText } from '@/lib/messenger/channels.server';

const ARCHIVE_DAYS = 365;

type HygieneDayRecord = {
  id: string;
  items?: HygieneItems;
  saveType?: string;
  slotCompletedAt?: Record<string, string>;
  inspectorName?: string;
};

async function loadDayRecord(storeId: string, dateYmd: string): Promise<HygieneDayRecord | null> {
  const snap = await adminDb.collection('hygiene_checklists')
    .where('storeId', '==', storeId)
    .where('checkDate', '==', dateYmd)
    .limit(1)
    .get();
  if (snap.empty) return null;
  const data = snap.docs[0].data();
  return {
    id: snap.docs[0].id,
    items: data.items as HygieneItems | undefined,
    saveType: data.saveType as string | undefined,
    slotCompletedAt: data.slotCompletedAt as Record<string, string> | undefined,
    inspectorName: data.inspectorName as string | undefined,
  };
}

export async function getHygieneAutomationStatus(
  storeId: string,
  dateYmd = getKSTTodayYMD(),
): Promise<{ date: string; slots: HygieneSlotStatus[]; recordId: string | null }> {
  const record = await loadDayRecord(storeId, dateYmd);
  const { totalMinutes } = kstDateParts();
  const slots = buildSlotStatuses(
    record as Parameters<typeof buildSlotStatuses>[0],
    dateYmd,
  ).map(s => ({
    ...s,
    overdue: !s.complete && isSlotOverdue(
      HYGIENE_SLOT_TEMPLATES.find(t => t.kind === s.kind)!,
      totalMinutes,
    ),
  }));
  return { date: dateYmd, slots, recordId: record?.id || null };
}

export async function syncHygieneLogMirror(
  storeId: string,
  checkDate: string,
  record: Record<string, unknown>,
): Promise<void> {
  const docId = `${storeId}_${checkDate}`;
  await adminDb.collection('hygiene_logs').doc(docId).set({
    storeId,
    checkDate,
    ...record,
    mirroredAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function runHygieneFollowupAlerts(storeId: string, dateYmd: string): Promise<number> {
  const record = await loadDayRecord(storeId, dateYmd);
  const items = (record?.items || {}) as HygieneItems;
  const { totalMinutes } = kstDateParts();
  let sent = 0;

  for (const slot of HYGIENE_SLOT_TEMPLATES) {
    if (!isSlotFollowupWindow(slot, totalMinutes)) continue;

    const complete = slot.kind === 'closing'
      ? record?.saveType === 'final' && hasSectionsComplete(items, slot.sectionIndices)
      : hasSectionsComplete(items, slot.sectionIndices);
    if (complete) continue;

    const dedupeId = `${storeId}_${dateYmd}_${slot.kind}_followup`;
    const dedupe = await adminDb.collection('hygiene_followup_sent').doc(dedupeId).get();
    if (dedupe.exists) continue;

    try {
      const roomId = await ensureTasksChannel(storeId);
      await postMessengerText({
        roomId,
        text: [
          `🧹 위생 ${slot.label} 미완료`,
          `마감 ${slot.dueHour}:${String(slot.dueMinute).padStart(2, '0')} + ${slot.followupMinutes}분 경과`,
          '위생점검일지에서 완료해 주세요.',
          `/dashboard/hygiene?date=${dateYmd}`,
        ].join('\n'),
      });
      await adminDb.collection('hygiene_followup_sent').doc(dedupeId).set({
        storeId,
        dateYmd,
        kind: slot.kind,
        sentAt: FieldValue.serverTimestamp(),
      });
      sent++;
    } catch { /* ignore */ }
  }
  return sent;
}

export async function loadHygieneRecordsForMonth(
  storeId: string,
  month: string,
): Promise<Array<{ checkDate: string; status?: string; items?: HygieneItems; saveType?: string }>> {
  const start = `${month}-01`;
  const end = `${month}-31`;
  const snap = await adminDb.collection('hygiene_checklists')
    .where('storeId', '==', storeId)
    .get();
  return snap.docs
    .map(d => d.data())
    .filter(r => r.checkDate >= start && r.checkDate <= end)
    .map(r => ({
      checkDate: String(r.checkDate),
      status: r.status as string | undefined,
      items: r.items as HygieneItems | undefined,
      saveType: r.saveType as string | undefined,
    }));
}

export async function generateHygieneMonthlyReport(
  storeId: string,
  month: string,
): Promise<HygieneMonthlySummary & { storeId: string; generatedAt: string }> {
  const records = await loadHygieneRecordsForMonth(storeId, month);
  const summary = summarizeHygieneMonth(month, records);
  const payload = {
    storeId,
    ...summary,
    generatedAt: new Date().toISOString(),
  };
  await adminDb.collection('hygiene_monthly_reports').doc(`${storeId}_${month}`).set(payload, { merge: true });
  return payload;
}

export async function archiveOldHygieneLogs(storeId: string): Promise<number> {
  const cutoff = addDaysYMD(getKSTTodayYMD(), -ARCHIVE_DAYS);
  const snap = await adminDb.collection('hygiene_checklists')
    .where('storeId', '==', storeId)
    .get();

  let archived = 0;
  const batch = adminDb.batch();
  for (const doc of snap.docs) {
    const date = String(doc.data().checkDate || '');
    if (!date || date >= cutoff) continue;
    batch.set(adminDb.collection('hygiene_logs_archive').doc(doc.id), {
      ...doc.data(),
      archivedAt: FieldValue.serverTimestamp(),
    });
    batch.delete(doc.ref);
    archived++;
    if (archived >= 400) break;
  }
  if (archived > 0) await batch.commit();
  return archived;
}

export async function postHygieneMonthlyReportMessenger(
  storeId: string,
  summary: HygieneMonthlySummary,
): Promise<void> {
  const roomId = await ensureTasksChannel(storeId);
  await postMessengerText({
    roomId,
    text: [
      `📋 ${summary.month} 위생 월간 보고서`,
      `완료일 ${summary.completedDays}/${summary.totalDays} (${summary.completionRate}%)`,
      `아침 ${summary.slotCompletionRates.morning}% · 오후 ${summary.slotCompletionRates.midday}% · 마감 ${summary.slotCompletionRates.closing}%`,
      '상세: /dashboard/hygiene/report',
    ].join('\n'),
  });
}

export type { HygieneSlotKind, HygieneSlotStatus, HygieneMonthlySummary };
