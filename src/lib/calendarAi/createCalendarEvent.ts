import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { HR_CALENDAR_LINK } from '@/lib/calendarAi/constants';
import type { CalendarEventSource, CreateCalendarEventResult } from '@/lib/calendarAi/types';

export async function createCalendarEvent(opts: {
  storeId: string;
  createdBy: string;
  title: string;
  startDate: string;
  endDate?: string;
  startTime?: string | null;
  endTime?: string | null;
  allDay?: boolean;
  description?: string | null;
  location?: string | null;
  calendarId?: string;
  reminders?: { type: string; minutes: number }[];
  source?: CalendarEventSource;
}): Promise<CreateCalendarEventResult> {
  const {
    storeId,
    createdBy,
    title,
    startDate,
    endDate = startDate,
    startTime = null,
    endTime = null,
    allDay = !startTime,
    description = null,
    location = null,
    calendarId = 'default',
    reminders,
    source = 'manual',
  } = opts;

  const defaultReminders = allDay
    ? [{ type: 'app', minutes: 1440 }]
    : [{ type: 'app', minutes: 60 }];

  const descLines = [description].filter(Boolean);
  if (source === 'ai_chat') {
    descLines.push('등록: AI 대화');
  }

  const ref = await adminDb.collection('calendar_events').add({
    storeId,
    title: title.slice(0, 120),
    startDate,
    endDate: endDate || startDate,
    startTime: allDay ? null : startTime,
    endTime: allDay ? null : endTime,
    allDay,
    calendarId,
    color: null,
    location: location?.slice(0, 120) || null,
    meetingUrl: null,
    description: descLines.join('\n').trim() || null,
    attendees: [],
    repeat: null,
    reminders: reminders ?? defaultReminders,
    visibility: 'public',
    status: 'busy',
    type: 'event',
    createdBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  return {
    id: ref.id,
    title,
    startDate,
    startTime: allDay ? null : startTime,
    allDay,
  };
}

export function formatCalendarCreatedMessage(result: CreateCalendarEventResult): string {
  const dateKr = result.startDate.replace(/-/g, '.');
  const timePart = result.allDay || !result.startTime
    ? '종일'
    : result.startTime;
  return (
    `📅 **캘린더에 일정을 등록했습니다**\n` +
    `· 제목: ${result.title}\n` +
    `· 일시: ${dateKr} ${timePart}\n` +
    `· [캘린더에서 보기](${HR_CALENDAR_LINK})`
  );
}
