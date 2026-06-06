import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  HOLIDAY_ORDER_ALERT_TYPE,
  resolveHolidayOrderAlert,
} from '@/lib/kakao/holidays';

function toYMD(d: Date) {
  return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchHolidays14Days(apiKey: string): Promise<string[]> {
  const holidays: string[] = [];
  const today = new Date();
  const months = new Set<string>();
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    months.add(`${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`);
  }
  for (const yyyymm of months) {
    try {
      const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${apiKey}&solYear=${yyyymm.slice(0,4)}&solMonth=${yyyymm.slice(4,6)}&numOfRows=30&pageNo=1&_type=json`;
      const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const json = await res.json();
      const items = json?.response?.body?.items?.item || [];
      (Array.isArray(items) ? items : [items]).forEach((i: { locdate?: string | number }) => {
        holidays.push(String(i.locdate));
      });
    } catch { /* ignore */ }
  }
  return holidays;
}

export async function GET(req: Request) {
  const cronSecret = req.headers.get('x-cron-secret');
  const isCron = process.env.CRON_SECRET && cronSecret === process.env.CRON_SECRET;
  if (!isCron) {
    const authUser = await verifyToken(req);
    if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const orderDays = (searchParams.get('orderDays') || '1,3').split(',').map(Number);

  const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
  const holidays = apiKey ? await fetchHolidays14Days(apiKey) : [];

  const today = new Date();
  const todayStr = toYMD(today);

  const calendar = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dateStr = toYMD(d);
    const dow = d.getDay();
    const isHoliday = holidays.includes(dateStr);
    const isOrderDay = orderDays.includes(dow);
    calendar.push({ date: dateStr, dow, isHoliday, isOrderDay });
  }

  const gaps: { start: string; end: string; days: number }[] = [];
  let gapStart: string | null = null;
  let gapDays = 0;
  calendar.forEach(day => {
    if (day.isHoliday || day.dow === 0) {
      if (!gapStart) gapStart = day.date;
      gapDays++;
    } else {
      if (gapStart && gapDays >= 2) gaps.push({ start: gapStart, end: day.date, days: gapDays });
      gapStart = null;
      gapDays = 0;
    }
  });

  const nextOrderDay = calendar.find(d => d.isOrderDay && d.date > todayStr);
  let dDay: number | null = null;
  let dDayType: 'D-2' | 'D-1' | '당일' | typeof HOLIDAY_ORDER_ALERT_TYPE | null = null;

  const holidayOrderAlert = resolveHolidayOrderAlert(todayStr, holidays);

  if (holidayOrderAlert) {
    dDayType = HOLIDAY_ORDER_ALERT_TYPE;
    dDay = holidayOrderAlert.daysUntil;
  } else if (nextOrderDay) {
    const diff = Math.floor((new Date(nextOrderDay.date).getTime() - today.getTime()) / 86400000);
    dDay = diff;
    if (diff === 0) dDayType = '당일';
    else if (diff === 1) dDayType = 'D-1';
    else if (diff === 2) dDayType = 'D-2';
  }

  return NextResponse.json({
    today: todayStr,
    calendar,
    holidays,
    gaps,
    nextOrderDay: nextOrderDay?.date || null,
    dDay,
    dDayType,
    holidayOrderAlert,
  });
}
