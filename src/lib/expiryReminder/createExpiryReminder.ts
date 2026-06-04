import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  CALENDAR_LINK,
  DEFAULT_EXPIRY_REMINDER_OFFSETS_DAYS,
  EXPIRY_CALENDAR_ID,
  EXPIRY_EVENT_TYPE,
} from '@/lib/expiryReminder/constants';
import type {
  CreateExpiryReminderResult,
  ExpiryReminderSource,
} from '@/lib/expiryReminder/types';

function emptySentMap(offsets: readonly number[]): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const d of offsets) out[String(d)] = false;
  return out;
}

export async function createExpiryReminder(opts: {
  storeId: string;
  createdBy: string;
  itemName: string;
  expiryDate: string;
  source: ExpiryReminderSource;
  reminderOffsetsDays?: number[];
}): Promise<CreateExpiryReminderResult> {
  const {
    storeId,
    createdBy,
    itemName,
    expiryDate,
    source,
    reminderOffsetsDays = [...DEFAULT_EXPIRY_REMINDER_OFFSETS_DAYS],
  } = opts;

  const offsets = [...new Set(reminderOffsetsDays.filter(d => d > 0 && d <= 60))].sort((a, b) => b - a);
  if (offsets.length === 0) {
    offsets.push(...DEFAULT_EXPIRY_REMINDER_OFFSETS_DAYS);
  }

  const existingSnap = await adminDb.collection('expiry_reminders')
    .where('storeId', '==', storeId)
    .limit(200)
    .get();

  const existingDoc = existingSnap.docs.find(d => {
    const x = d.data();
    return x.status === 'active' && x.itemName === itemName && x.expiryDate === expiryDate;
  });

  if (existingDoc) {
    const doc = existingDoc;
    const data = doc.data();
    return {
      id: doc.id,
      calendarEventId: String(data.calendarEventId || ''),
      itemName,
      expiryDate,
      reminderOffsetsDays: (data.reminderOffsetsDays as number[]) || offsets,
      isUpdate: true,
    };
  }

  const title = `[유통기한] ${itemName}`;
  const description = [
    `품목: ${itemName}`,
    `유통기한: ${expiryDate}`,
    `알림: ${offsets.map(d => `${d}일 전`).join(', ')}`,
    `등록: ${source}`,
  ].join('\n');

  const calRef = await adminDb.collection('calendar_events').add({
    storeId,
    title,
    startDate: expiryDate,
    endDate: expiryDate,
    startTime: null,
    endTime: null,
    allDay: true,
    calendarId: EXPIRY_CALENDAR_ID,
    color: '#f59e0b',
    description,
    type: EXPIRY_EVENT_TYPE,
    createdBy,
    reminders: [],
    visibility: 'public',
    status: 'busy',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const ref = await adminDb.collection('expiry_reminders').add({
    storeId,
    createdBy,
    itemName,
    expiryDate,
    calendarEventId: calRef.id,
    source,
    reminderOffsetsDays: offsets,
    notificationsSent: emptySentMap(offsets),
    status: 'active',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    id: ref.id,
    calendarEventId: calRef.id,
    itemName,
    expiryDate,
    reminderOffsetsDays: offsets,
    isUpdate: false,
  };
}

export function formatExpiryCreatedMessage(result: CreateExpiryReminderResult): string {
  const dateKr = result.expiryDate.replace(/-/g, '.');
  const offsets = result.reminderOffsetsDays.map(d => `${d}일 전`).join(', ');
  const verb = result.isUpdate ? '이미 등록되어 있습니다' : '캘린더에 등록했습니다';
  return (
    `📅 **유통기한 ${verb}**\n` +
    `· 품목: ${result.itemName}\n` +
    `· 만료일: ${dateKr}\n` +
    `· 알림 예정: ${offsets} ([캘린더](${CALENDAR_LINK}))`
  );
}
