import { getKSTTodayYMD } from '@/lib/dateUtils';

export const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface RequestAttachment {
  id: string;
  fileName: string;
  fileUrl: string;
  mimeType: string;
  size: number;
}

export interface CustomerRequestLog {
  id: string;
  storeId: string;
  cusCode: string;
  requestDate: string;
  requestTime: string;
  dayOfWeek: string;
  content: string;
  attachments: RequestAttachment[];
  createdAt: string;
  updatedAt: string;
  createdByEmail: string;
  updatedByEmail: string;
}

/** YYYY-MM-DD → 요일 (KST) */
export function dayOfWeekFromYMD(ymd: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return '';
  const d = new Date(`${ymd}T12:00:00+09:00`);
  return DOW_LABELS[d.getDay()] || '';
}

/** 현재 KST 시각 HH:mm */
export function getKSTNowTimeHM(): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const h = parts.find(p => p.type === 'hour')?.value ?? '00';
  const m = parts.find(p => p.type === 'minute')?.value ?? '00';
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

export function defaultRequestForm() {
  const date = getKSTTodayYMD();
  return {
    requestDate: date,
    requestTime: getKSTNowTimeHM(),
    dayOfWeek: dayOfWeekFromYMD(date),
    content: '',
    attachments: [] as RequestAttachment[],
  };
}

export function serializeTimestamp(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'object' && v !== null && 'toDate' in v && typeof (v as { toDate: () => Date }).toDate === 'function') {
    return (v as { toDate: () => Date }).toDate().toISOString();
  }
  return '';
}
