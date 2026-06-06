import { generateJsonWithFallback } from '@/lib/aiProviderFallback';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { EXPIRY_KEYWORD_RE } from '@/lib/expiryReminder/constants';
import {
  CALENDAR_DATE_HINT_RE,
  CALENDAR_HOWTO_RE,
  CALENDAR_INTENT_RE,
} from '@/lib/calendarAi/constants';
import type { ParsedCalendarEventInput } from '@/lib/calendarAi/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

function normalizeDateYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = getKSTTodayYMD();
  const todayYear = Number(today.slice(0, 4));
  let y = year;
  if (!year || year < 100) y = todayYear;
  if (y < 100) y += 2000;
  let candidate = `${y}-${pad2(month)}-${pad2(day)}`;
  if (candidate < today && y === todayYear) {
    candidate = `${todayYear + 1}-${pad2(month)}-${pad2(day)}`;
  }
  const d = new Date(`${candidate}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return candidate;
}

const DOW_MAP: Record<string, number> = {
  일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6,
};

function resolveRelativeDate(text: string): string | null {
  const today = getKSTTodayYMD();
  if (/오늘/.test(text)) return today;
  if (/내일/.test(text)) return addDaysYMD(today, 1);
  if (/모레/.test(text)) return addDaysYMD(today, 2);
  if (/글피/.test(text)) return addDaysYMD(today, 3);

  const nextWeek = text.match(/(?:다음\s*주|차\s*주)\s*(월|화|수|목|금|토|일)요일/);
  if (nextWeek) {
    const targetDow = DOW_MAP[nextWeek[1]];
    const base = new Date(`${today}T12:00:00+09:00`);
    const curDow = base.getDay();
    let delta = targetDow - curDow;
    if (delta <= 0) delta += 7;
    delta += 7;
    return addDaysYMD(today, delta);
  }

  const thisWeek = text.match(/(?:이번\s*주\s*)?(월|화|수|목|금|토|일)요일/);
  if (thisWeek) {
    const targetDow = DOW_MAP[thisWeek[1]];
    const base = new Date(`${today}T12:00:00+09:00`);
    const curDow = base.getDay();
    let delta = targetDow - curDow;
    if (delta < 0) delta += 7;
    if (delta === 0 && !/오늘/.test(text)) delta = 7;
    return addDaysYMD(today, delta);
  }

  return null;
}

function parseDateFromText(text: string): string | null {
  const ymdSlash = text.match(/(\d{4})[./-](\d{1,2})[./-](\d{1,2})/);
  if (ymdSlash) {
    return normalizeDateYmd(Number(ymdSlash[1]), Number(ymdSlash[2]), Number(ymdSlash[3]));
  }

  const kr = text.match(/(\d{1,2})\s*월\s*(\d{1,2})\s*일/);
  if (kr) {
    return normalizeDateYmd(0, Number(kr[1]), Number(kr[2]));
  }

  return resolveRelativeDate(text);
}

function parseTimeFromText(text: string): { startTime: string | null; allDay: boolean } {
  const hm = text.match(/(\d{1,2})\s*[:：]\s*(\d{2})/);
  if (hm) {
    const h = Number(hm[1]);
    const m = Number(hm[2]);
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { startTime: `${pad2(h)}:${pad2(m)}`, allDay: false };
    }
  }

  const ampm = text.match(/(오전|오후)\s*(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (ampm) {
    let h = Number(ampm[2]);
    const m = ampm[3] ? Number(ampm[3]) : 0;
    if (ampm[1] === '오후' && h < 12) h += 12;
    if (ampm[1] === '오전' && h === 12) h = 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { startTime: `${pad2(h)}:${pad2(m)}`, allDay: false };
    }
  }

  const hourOnly = text.match(/(\d{1,2})\s*시(?:\s*(\d{1,2})\s*분)?/);
  if (hourOnly) {
    const h = Number(hourOnly[1]);
    const m = hourOnly[2] ? Number(hourOnly[2]) : 0;
    if (h >= 0 && h <= 23 && m >= 0 && m <= 59) {
      return { startTime: `${pad2(h)}:${pad2(m)}`, allDay: false };
    }
  }

  return { startTime: null, allDay: true };
}

function stripForTitle(text: string): string {
  return text
    .replace(CALENDAR_INTENT_RE, '')
    .replace(EXPIRY_KEYWORD_RE, '')
    .replace(/\d{4}[./-]\d{1,2}[./-]\d{1,2}/g, '')
    .replace(/\d{1,2}\s*월\s*\d{1,2}\s*일/g, '')
    .replace(/(?:다음\s*주|차\s*주|이번\s*주)?\s*[월화수목금토일]요일/g, '')
    .replace(/오늘|내일|모레|글피/g, '')
    .replace(/(?:오전|오후)\s*\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?/g, '')
    .replace(/\d{1,2}\s*[:：]\s*\d{2}/g, '')
    .replace(/\d{1,2}\s*시(?:\s*\d{1,2}\s*분)?/g, '')
    .replace(/캘린더|일정|스케줄/g, '')
    .replace(/[:\s]+/g, ' ')
    .trim()
    .slice(0, 80);
}

export function looksLikeCalendarEventMessage(message: string): boolean {
  const text = message.trim();
  if (!text || EXPIRY_KEYWORD_RE.test(text)) return false;
  if (CALENDAR_HOWTO_RE.test(text) && !/(?:등록|추가|잡아)\s*줘/.test(text)) return false;
  if (CALENDAR_INTENT_RE.test(text) && CALENDAR_DATE_HINT_RE.test(text)) return true;
  if (CALENDAR_INTENT_RE.test(text)) return true;
  return false;
}

export function parseEventByRules(message: string): ParsedCalendarEventInput | null {
  const text = message.trim();
  if (!looksLikeCalendarEventMessage(text)) return null;

  const startDate = parseDateFromText(text);
  if (!startDate) return null;

  const { startTime, allDay } = parseTimeFromText(text);
  let title = stripForTitle(text);
  if (!title || title.length < 2) {
    title = allDay && startTime ? '일정' : (allDay ? '일정' : '미팅');
  }

  return {
    title,
    startDate,
    endDate: startDate,
    startTime,
    endTime: startTime,
    allDay,
    description: null,
    location: null,
  };
}

const AI_PARSE_SYSTEM = `정육점 캘린더 일정 등록 문장에서 일정 정보를 추출합니다.
반드시 JSON만 반환:
{"title":"일정 제목","startDate":"YYYY-MM-DD","startTime":"HH:mm 또는 null","allDay":true|false,"location":null}
- 유통기한/소비기한/만료일 관련이면 title을 null로
- 일정 등록 의도가 아니면 title을 null로
- startDate는 KST, 연도 없으면 올해·지난 날짜면 내년
- 시간 없으면 allDay true, startTime null`;

type CalendarAiJson = {
  title?: string | null;
  startDate?: string | null;
  startTime?: string | null;
  allDay?: boolean | null;
  location?: string | null;
};

function isCalendarAiJson(parsed: unknown): parsed is CalendarAiJson {
  return typeof parsed === 'object' && parsed !== null;
}

export async function parseEventByAi(message: string): Promise<ParsedCalendarEventInput | null> {
  const today = getKSTTodayYMD();
  try {
    const { data } = await generateJsonWithFallback<CalendarAiJson>({
      system: AI_PARSE_SYSTEM,
      prompt: `오늘(KST): ${today}\n문장: ${message.slice(0, 500)}`,
      json: true,
      temperature: 0,
      useCase: 'fast',
      validate: isCalendarAiJson,
    });
    const title = (data.title || '').trim();
    const startDate = (data.startDate || '').trim();
    if (!title || !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) return null;
    if (startDate < today) return null;

    const startTime = (data.startTime || '').trim();
    const hasTime = /^\d{2}:\d{2}$/.test(startTime);
    const allDay = data.allDay ?? !hasTime;

    return {
      title: title.slice(0, 80),
      startDate,
      endDate: startDate,
      startTime: hasTime && !allDay ? startTime : null,
      endTime: hasTime && !allDay ? startTime : null,
      allDay: !hasTime || allDay,
      description: null,
      location: (data.location || '').trim() || null,
    };
  } catch {
    return null;
  }
}

export async function parseEventMessage(message: string): Promise<ParsedCalendarEventInput | null> {
  if (!looksLikeCalendarEventMessage(message)) return null;
  const ruled = parseEventByRules(message);
  if (ruled) return ruled;
  return parseEventByAi(message);
}
