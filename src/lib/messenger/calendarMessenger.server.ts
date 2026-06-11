import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, getWeekdayKo, normDateYMD } from '@/lib/dateUtils';
import { getUpcomingHolidayAlerts, holidayAlertMessage } from '@/lib/kakao/holidays';
import {
  ensureScheduleChannel,
  markCalendarNotificationSent,
  postMessengerCard,
  wasCalendarNotificationSent,
} from '@/lib/messenger/channels.server';
import type { MessengerCalendarEvent } from '@/lib/messenger/calendarTypes';

function eventDate(row: Record<string, unknown>): string {
  return normDateYMD(String(row.date || row.startDate || ''));
}

function dateInRange(start: string, end: string, target: string): boolean {
  const s = normDateYMD(start);
  const e = normDateYMD(end);
  const t = normDateYMD(target);
  return !!t && t >= s && t <= e;
}

export async function listMessengerCalendarEvents(
  storeId: string,
  fromYmd: string,
  toYmd: string,
): Promise<MessengerCalendarEvent[]> {
  const [calSnap, hrSnap] = await Promise.all([
    adminDb.collection('calendar_events').where('storeId', '==', storeId).limit(500).get(),
    adminDb.collection('hr_calendar_events').where('storeId', '==', storeId).limit(500).get(),
  ]);

  const events: MessengerCalendarEvent[] = [];

  for (const d of calSnap.docs) {
    const r = d.data();
    const date = eventDate(r);
    if (!date || date < fromYmd || date > toYmd) continue;
    events.push({
      id: d.id,
      source: 'calendar',
      title: String(r.title || ''),
      date,
      endDate: normDateYMD(String(r.endDate || date)),
      startTime: r.startTime ? String(r.startTime) : undefined,
      description: r.description ? String(r.description) : undefined,
      type: String(r.type || 'event'),
    });
  }

  for (const d of hrSnap.docs) {
    const r = d.data();
    const date = eventDate(r);
    if (!date || date < fromYmd || date > toYmd) continue;
    events.push({
      id: d.id,
      source: 'hr',
      title: String(r.title || ''),
      date,
      eventType: r.eventType ? String(r.eventType) : undefined,
      type: String(r.type || ''),
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'ko'));
}

export async function createMessengerCalendarEvent(
  storeId: string,
  input: {
    title: string;
    startDate: string;
    endDate?: string;
    startTime?: string;
    description?: string;
    createdBy: string;
  },
) {
  const startDate = normDateYMD(input.startDate);
  const ref = await adminDb.collection('calendar_events').add({
    storeId,
    title: input.title.trim(),
    startDate,
    endDate: normDateYMD(input.endDate || startDate),
    startTime: input.startTime || null,
    allDay: !input.startTime,
    calendarId: 'messenger',
    description: input.description || '',
    type: 'event',
    createdBy: input.createdBy,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });

  const roomId = await ensureScheduleChannel(storeId);
  await postMessengerCard({
    roomId,
    type: 'calendar_event',
    calendarKey: `created_${ref.id}`,
    cardData: {
      title: input.title.trim(),
      subtitle: startDate,
      fields: input.startTime
        ? [{ label: '시간', value: input.startTime }]
        : [{ label: '종일', value: '예' }],
      footer: '메신저에서 등록된 일정',
    },
  });

  return { id: ref.id };
}

async function getTodayAbsenceNames(storeId: string, dateYmd: string): Promise<string[]> {
  const dow = getWeekdayKo(dateYmd);
  const [leaveSnap, dayoffSnap, empSnap] = await Promise.all([
    adminDb.collection('hr_leave_requests').where('storeId', '==', storeId).get(),
    adminDb.collection('hr_dayoff_requests').where('storeId', '==', storeId).get(),
    adminDb.collection('hr_employees').where('storeId', '==', storeId).get(),
  ]);

  const names = new Set<string>();

  leaveSnap.docs.forEach(d => {
    const r = d.data();
    if (r.status !== 'approved' || !r.userName) return;
    if (dateInRange(String(r.startDate), String(r.endDate), dateYmd)) {
      names.add(String(r.userName));
    }
  });

  dayoffSnap.docs.forEach(d => {
    const r = d.data();
    if (r.status !== 'approved' || !r.userName || !Array.isArray(r.dates)) return;
    if (r.dates.some((x: string) => normDateYMD(x) === dateYmd)) {
      names.add(String(r.userName));
    }
  });

  empSnap.docs.forEach(d => {
    const r = d.data();
    if (r.status === '퇴사' || !r.name || !dow) return;
    if ((r.daysOff || []).includes(dow)) names.add(String(r.name));
  });

  return [...names];
}

export interface CalendarNotifyResult {
  storeId: string;
  sent: number;
  skipped: number;
  items: string[];
}

export async function runCalendarMessengerNotifications(
  storeId: string,
): Promise<CalendarNotifyResult> {
  if (!storeId) throw new Error('storeId required');
  const today = getKSTTodayYMD();
  const tomorrow = addDaysYMD(today, 1);
  const roomId = await ensureScheduleChannel(storeId);

  let sent = 0;
  let skipped = 0;
  const items: string[] = [];

  const postIfNew = async (
    dedupeKey: string,
    title: string,
    subtitle: string,
    fields: { label: string; value: string }[],
    footer: string,
  ) => {
    if (await wasCalendarNotificationSent(storeId, dedupeKey)) {
      skipped++;
      return;
    }
    await postMessengerCard({
      roomId,
      type: 'calendar_event',
      calendarKey: dedupeKey,
      text: title,
      cardData: { title, subtitle, fields, footer },
      actions: [{ id: 'detail', label: '캘린더 보기', style: 'ghost' }],
    });
    await markCalendarNotificationSent(storeId, dedupeKey);
    sent++;
    items.push(title);
  };

  // 1) 내일 납품/입고 예정
  const hrSnap = await adminDb.collection('hr_calendar_events')
    .where('storeId', '==', storeId)
    .limit(500)
    .get();

  for (const d of hrSnap.docs) {
    const r = d.data();
    const date = eventDate(r);
    if (date !== tomorrow) continue;
    const eventType = String(r.eventType || '');
    const title = String(r.title || '');
    if (eventType !== 'delivery_expected' && !title.includes('입고')) continue;

    const supplier = String(r.supplierName || title.replace(/^🚚\s*/, '').replace(/\s*입고.*$/, ''));
    const itemDetail = String(r.itemName || r.productName || r.memo || title.replace(/^🚚\s*[^ ]+\s*/, '').trim() || '입고 예정');
    const msgTitle = itemDetail && itemDetail !== '입고 예정'
      ? `내일 납품 예정: ${supplier} ${itemDetail}`
      : `내일 납품 예정: ${supplier}`;
    await postIfNew(
      `delivery_${tomorrow}_${d.id}`,
      msgTitle,
      tomorrow,
      [
        { label: '거래처', value: supplier },
        { label: '품목', value: itemDetail },
        { label: '일정', value: title },
      ],
      '발주·입고 준비를 확인하세요',
    );
  }

  // 2) 오늘 휴무/연차
  const absent = await getTodayAbsenceNames(storeId, today);
  for (const name of absent) {
    const msgTitle = `오늘 ${name} 휴무입니다`;
    await postIfNew(
      `absence_${today}_${name}`,
      msgTitle,
      today,
      [{ label: '직원', value: name }, { label: '구분', value: '휴무/연차' }],
      '근무 스케줄을 확인하세요',
    );
  }

  // 3) 3일 후 공휴일
  const holidayAlerts = getUpcomingHolidayAlerts(today, [3]);
  for (const alert of holidayAlerts) {
    const msgTitle = `3일 후 공휴일: 발주 서두르세요`;
    const body = holidayAlertMessage(alert.period, alert.daysBefore);
    await postIfNew(
      `holiday_${today}_${alert.period.startDate}_3d`,
      msgTitle,
      alert.label,
      [{ label: '휴일', value: alert.label }, { label: '안내', value: body.slice(0, 80) }],
      '발주 마감을 확인하세요',
    );
  }

  return { storeId, sent, skipped, items };
}

export async function getEmployeeWeekSchedule(storeId: string, weekStart: string) {
  const weekEnd = addDaysYMD(weekStart, 6);
  const events = await listMessengerCalendarEvents(storeId, weekStart, weekEnd);
  const absences: Record<string, string[]> = {};

  for (let i = 0; i < 7; i++) {
    const d = addDaysYMD(weekStart, i);
    absences[d] = await getTodayAbsenceNames(storeId, d);
  }

  return { weekStart, weekEnd, events, absences };
}

/** 연차/휴무 승인 시 오늘 해당하면 직원일정 채널에 즉시 알림 */
export async function notifyAbsenceIfToday(
  storeId: string,
  userName: string,
  startDate: string,
  endDate: string,
  kind: 'leave' | 'dayoff' = 'leave',
): Promise<boolean> {
  if (!storeId || !userName) return false;
  const today = getKSTTodayYMD();
  if (!dateInRange(startDate, endDate, today)) return false;

  const dedupeKey = `absence_${today}_${userName}`;
  if (await wasCalendarNotificationSent(storeId, dedupeKey)) return false;

  const roomId = await ensureScheduleChannel(storeId);
  const msgTitle = `오늘 ${userName} 휴무입니다`;
  await postMessengerCard({
    roomId,
    type: 'calendar_event',
    calendarKey: dedupeKey,
    text: msgTitle,
    cardData: {
      title: msgTitle,
      subtitle: today,
      fields: [
        { label: '직원', value: userName },
        { label: '구분', value: kind === 'leave' ? '연차/휴가' : '휴무' },
      ],
      footer: '근무 스케줄을 확인하세요',
    },
    actions: [{ id: 'detail', label: '캘린더 보기', style: 'ghost' }],
  });
  await markCalendarNotificationSent(storeId, dedupeKey);
  return true;
}
