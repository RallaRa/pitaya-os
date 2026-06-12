import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  countPhaseProgress,
  dailyChecklistDocId,
  formatKstHm,
  PHASE_LABELS,
  getItemsForPhase,
  type ChecklistItemState,
  type ChecklistPhase,
  type DailyChecklistDoc,
  type PhaseRecord,
} from '@/lib/dailyChecklist';
import { ensureTasksChannel, postMessengerText } from '@/lib/messenger/channels.server';

const CHECKLIST_LINK = '/dashboard/operations/checklist';

export async function getDailyChecklist(
  storeId: string,
  checkDate: string,
): Promise<(DailyChecklistDoc & { id: string }) | null> {
  const ref = adminDb.collection('daily_checklist').doc(dailyChecklistDocId(storeId, checkDate));
  const snap = await ref.get();
  if (!snap.exists) return null;
  return { id: snap.id, ...(snap.data() as DailyChecklistDoc) };
}

export async function saveDailyChecklistPhase(input: {
  storeId: string;
  checkDate: string;
  phase: ChecklistPhase;
  assigneeName: string;
  notes: string;
  items: Record<string, ChecklistItemState>;
  uid: string;
  finalize: boolean;
}): Promise<{
  id: string;
  complete: boolean;
  checked: number;
  total: number;
  messengerSent: boolean;
  uncheckedLabels: string[];
}> {
  const progress = countPhaseProgress(input.phase, input.items);
  if (input.finalize && !progress.complete) {
    return {
      id: dailyChecklistDocId(input.storeId, input.checkDate),
      complete: false,
      checked: progress.checked,
      total: progress.total,
      messengerSent: false,
      uncheckedLabels: progress.uncheckedLabels,
    };
  }

  const docId = dailyChecklistDocId(input.storeId, input.checkDate);
  const ref = adminDb.collection('daily_checklist').doc(docId);
  const existing = await ref.get();
  const prevPhase = existing.exists
    ? (existing.data()?.[input.phase] as PhaseRecord | undefined)
    : undefined;

  const phaseRecord: PhaseRecord = {
    items: input.items,
    assigneeName: input.assigneeName,
    notes: input.notes,
    completedBy: input.uid,
    messengerSent: prevPhase?.messengerSent ?? false,
    incompleteAlertSent: prevPhase?.incompleteAlertSent ?? false,
  };

  if (input.finalize && progress.complete) {
    phaseRecord.completedAt = FieldValue.serverTimestamp();
  }

  await ref.set({
    storeId: input.storeId,
    checkDate: input.checkDate,
    [input.phase]: phaseRecord,
    updatedAt: FieldValue.serverTimestamp(),
    ...(existing.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
  }, { merge: true });

  let messengerSent = phaseRecord.messengerSent ?? false;
  if (input.finalize && progress.complete && !messengerSent) {
    await sendPhaseCompleteMessenger(
      input.storeId,
      input.phase,
      input.assigneeName,
      input.notes,
    );
    messengerSent = true;
    await ref.update({
      [`${input.phase}.messengerSent`]: true,
      [`${input.phase}.completedAt`]: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  return {
    id: docId,
    complete: progress.complete,
    checked: progress.checked,
    total: progress.total,
    messengerSent,
    uncheckedLabels: progress.uncheckedLabels,
  };
}

export async function sendPhaseCompleteMessenger(
  storeId: string,
  phase: ChecklistPhase,
  assigneeName: string,
  notes: string,
): Promise<void> {
  const label = PHASE_LABELS[phase];
  const time = formatKstHm();
  const lines = [
    `✅ ${label} 체크리스트 완료 ${time}`,
    `   담당: ${assigneeName || '—'}`,
  ];
  if (notes.trim()) {
    lines.push(`   특이사항: ${notes.trim()}`);
  }
  const roomId = await ensureTasksChannel(storeId);
  await postMessengerText({ roomId, text: lines.join('\n') });
}

export async function sendIncompleteAlertMessenger(
  storeId: string,
  phase: ChecklistPhase,
  uncheckedLabels: string[],
): Promise<void> {
  const label = PHASE_LABELS[phase];
  const text = [
    `⚠️ ${label} 체크리스트 미완료`,
    `미체크: ${uncheckedLabels.join(', ')}`,
    `→ ${CHECKLIST_LINK}`,
  ].join('\n');
  const roomId = await ensureTasksChannel(storeId);
  await postMessengerText({ roomId, text });
}

export type ChecklistAlertKind = 'open' | 'close';

export async function runDailyChecklistAlerts(
  kind: ChecklistAlertKind,
  checkDate: string,
): Promise<{ alerted: number; skipped: number }> {
  const phase: ChecklistPhase = kind;
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  let alerted = 0;
  let skipped = 0;

  for (const storeDoc of storesSnap.docs) {
    const storeId = storeDoc.id;
    try {
      const record = await getDailyChecklist(storeId, checkDate);
      const phaseData = record?.[phase];
      const progress = countPhaseProgress(phase, phaseData?.items);

      if (progress.complete || phaseData?.incompleteAlertSent) {
        skipped++;
        continue;
      }

      await sendIncompleteAlertMessenger(
        storeId,
        phase,
        progress.checked === 0
          ? getItemsForPhase(phase).map(i => i.label)
          : progress.uncheckedLabels,
      );

      const ref = adminDb.collection('daily_checklist').doc(dailyChecklistDocId(storeId, checkDate));
      await ref.set({
        storeId,
        checkDate,
        [phase]: {
          items: phaseData?.items || {},
          assigneeName: phaseData?.assigneeName || '',
          notes: phaseData?.notes || '',
          incompleteAlertSent: true,
        },
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });

      alerted++;
    } catch {
      skipped++;
    }
  }

  return { alerted, skipped };
}

export function parseChecklistAlertKind(raw: string | null): ChecklistAlertKind | null {
  if (raw === 'open' || raw === 'close') return raw;
  return null;
}

export function inferChecklistAlertKind(hour: number, minute: number): ChecklistAlertKind | null {
  const total = hour * 60 + minute;
  if (total >= 9 * 60 + 25 && total < 10 * 60) return 'open';
  if (total >= 21 * 60 && total < 21 * 60 + 30) return 'close';
  return null;
}
