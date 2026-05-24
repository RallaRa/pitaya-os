/* ═══════════════════════ TYPES ═══════════════════════ */

export type ViewMode = 'day' | 'week' | 'month' | 'year' | 'list' | '4day';
export type EventType = 'event' | 'todo' | 'leave' | 'dayoff' | 'holiday' | 'task';
export type EventSource = 'pitaya' | 'google' | 'naver' | 'ical';

export interface RepeatConfig {
  type: 'none' | 'daily' | 'weekly' | 'biweekly' | 'monthly' | 'monthly_weekday' | 'yearly' | 'custom';
  interval?: number;
  weekdays?: number[];       // 0=Sun..6=Sat
  monthDay?: number;
  monthWeek?: number;
  monthWeekday?: number;
  endType: 'none' | 'count' | 'date';
  endCount?: number;
  endDate?: string;
}

export interface Reminder {
  type: 'email' | 'app';
  minutes: number;
}

export interface Attendee {
  uid?: string;
  name: string;
  email: string;
  status: 'accepted' | 'declined' | 'tentative' | 'invited';
}

export interface SubTask {
  id: string;
  title: string;
  completed: boolean;
}

export interface CalEvent {
  id: string;
  title: string;
  startDate: string;
  startTime?: string;
  endDate: string;
  endTime?: string;
  allDay?: boolean;
  calendarId: string;
  color?: string;
  location?: string;
  meetingUrl?: string;
  description?: string;
  attendees?: Attendee[];
  repeat?: RepeatConfig | null;
  reminders?: Reminder[];
  visibility?: 'public' | 'private' | 'attendees';
  busyStatus?: 'busy' | 'free';
  type: EventType;
  source: EventSource;
  status?: string;
  userId?: string;
  userName?: string;
  createdBy?: string;
}

export interface TodoItem {
  id: string;
  title: string;
  completed: boolean;
  completedAt?: any;
  dueDate?: string;
  dueTime?: string;
  hasTime?: boolean;
  repeat?: RepeatConfig | null;
  listId: string;
  priority?: 'high' | 'medium' | 'low';
  subTasks: SubTask[];
  description?: string;
  assignedTo?: string;
  createdBy: string;
  storeId: string;
  order: number;
}

export interface CalendarList {
  id: string;
  name: string;
  color: string;
  visible: boolean;
  isDefault?: boolean;
  isSystem?: boolean;
  type: 'personal' | 'hr' | 'holiday' | 'shared';
}

export interface TodoList {
  id: string;
  name: string;
  color: string;
}

/* ═══════════════════════ CONSTANTS ═══════════════════════ */

export const GOOGLE_COLORS: { name: string; value: string }[] = [
  { name: '토마토',    value: '#d50000' },
  { name: '플라밍고',  value: '#e67c73' },
  { name: '귤',       value: '#f4511e' },
  { name: '바나나',   value: '#f6bf26' },
  { name: '세이지',   value: '#33b679' },
  { name: '바질',     value: '#0b8043' },
  { name: '피콕',     value: '#039be5' },
  { name: '블루베리', value: '#3f51b5' },
  { name: '라벤더',   value: '#7986cb' },
  { name: '포도',     value: '#8e24aa' },
  { name: '그라파이트', value: '#616161' },
];

export const REPEAT_LABELS: Record<string, string> = {
  none:            '반복 안 함',
  daily:           '매일',
  weekly:          '매주',
  biweekly:        '격주',
  monthly:         '매월',
  monthly_weekday: '매월 N번째 N요일',
  yearly:          '매년',
  custom:          '커스텀',
};

export const REMINDER_MINUTES: { label: string; value: number }[] = [
  { label: '0분 전',  value: 0 },
  { label: '5분 전',  value: 5 },
  { label: '10분 전', value: 10 },
  { label: '15분 전', value: 15 },
  { label: '30분 전', value: 30 },
  { label: '1시간 전', value: 60 },
  { label: '2시간 전', value: 120 },
  { label: '1일 전',  value: 1440 },
  { label: '1주 전',  value: 10080 },
];

export const DOW_KO = ['일', '월', '화', '수', '목', '금', '토'];

export const HOLIDAYS: Record<string, string> = {
  '2024-01-01': '신정', '2024-02-09': '설날 연휴', '2024-02-10': '설날',
  '2024-02-11': '설날 연휴', '2024-02-12': '대체공휴일', '2024-03-01': '3·1절',
  '2024-04-10': '국회의원선거일', '2024-05-05': '어린이날', '2024-05-06': '대체공휴일',
  '2024-05-15': '부처님오신날', '2024-06-06': '현충일', '2024-08-15': '광복절',
  '2024-09-16': '추석 연휴', '2024-09-17': '추석', '2024-09-18': '추석 연휴',
  '2024-10-03': '개천절', '2024-10-09': '한글날', '2024-12-25': '크리스마스',
  '2025-01-01': '신정', '2025-01-28': '설날 연휴', '2025-01-29': '설날',
  '2025-01-30': '설날 연휴', '2025-03-01': '3·1절', '2025-03-03': '대체공휴일',
  '2025-05-05': '어린이날', '2025-05-06': '부처님오신날', '2025-06-06': '현충일',
  '2025-08-15': '광복절', '2025-10-03': '개천절', '2025-10-05': '추석 연휴',
  '2025-10-06': '추석', '2025-10-07': '추석 연휴', '2025-10-08': '대체공휴일',
  '2025-10-09': '한글날', '2025-12-25': '크리스마스',
  '2026-01-01': '신정', '2026-02-16': '설날 연휴', '2026-02-17': '설날',
  '2026-02-18': '설날 연휴', '2026-03-01': '3·1절', '2026-03-02': '대체공휴일',
  '2026-05-05': '어린이날', '2026-05-24': '부처님오신날', '2026-05-25': '대체공휴일',
  '2026-06-06': '현충일', '2026-08-15': '광복절', '2026-08-17': '대체공휴일',
  '2026-09-24': '추석', '2026-09-25': '추석 연휴', '2026-10-03': '개천절',
  '2026-10-05': '대체공휴일', '2026-10-09': '한글날', '2026-12-25': '크리스마스',
};

/* ═══════════════════════ UTILS ═══════════════════════ */

export function toDateStr(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function getMonthDays(year: number, month: number): Date[] {
  const first = new Date(year, month, 1);
  const dow   = first.getDay();
  const last  = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = dow - 1; i >= 0; i--) days.push(new Date(year, month, -i));
  for (let d = 1; d <= last; d++)    days.push(new Date(year, month, d));
  while (days.length % 7 !== 0)     days.push(new Date(year, month + 1, days.length - dow - last + 1));
  return days;
}

export function getWeekDays(date: Date): Date[] {
  const sun = new Date(date);
  sun.setDate(date.getDate() - date.getDay());
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(sun);
    d.setDate(sun.getDate() + i);
    return d;
  });
}

export function getNDays(date: Date, n: number): Date[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(date);
    d.setDate(date.getDate() + i);
    return d;
  });
}

export function getWeekNumber(d: Date): number {
  const date = new Date(d.getTime());
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() + 3 - (date.getDay() + 6) % 7);
  const week1 = new Date(date.getFullYear(), 0, 4);
  return 1 + Math.round(((date.getTime() - week1.getTime()) / 86400000 - 3 + (week1.getDay() + 6) % 7) / 7);
}

export function formatTime(time?: string): string {
  if (!time) return '';
  const [h, m] = time.split(':').map(Number);
  const ampm = h < 12 ? '오전' : '오후';
  const hh   = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${ampm} ${hh}:${String(m).padStart(2, '0')}`;
}

export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function timeToMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number);
  return h * 60 + m;
}

export function eventsOnDate(events: CalEvent[], dateStr: string): CalEvent[] {
  return events.filter(e => e.startDate <= dateStr && e.endDate >= dateStr);
}

export function getEventColor(ev: CalEvent, calendars: CalendarList[]): string {
  if (ev.color) return ev.color;
  const cal = calendars.find(c => c.id === ev.calendarId);
  if (cal) return cal.color;
  if (ev.type === 'holiday') return '#fc8181';
  if (ev.type === 'leave')   return '#48bb78';
  if (ev.type === 'dayoff')  return '#4299e1';
  return '#7986cb';
}
