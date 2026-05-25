import { NextResponse } from 'next/server';

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
      (Array.isArray(items) ? items : [items]).forEach((i:any) => holidays.push(String(i.locdate)));
    } catch {}
  }
  return holidays;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const orderDays = (searchParams.get('orderDays') || '1,3').split(',').map(Number); // 발주 요일
  const leadTime = Number(searchParams.get('leadTime') || '1'); // 리드타임(일)

  const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
  const holidays = apiKey ? await fetchHolidays14Days(apiKey) : [];

  const today = new Date();
  const todayStr = toYMD(today);

  // 14일 캘린더 생성
  const calendar = [];
  for (let i = 0; i < 14; i++) {
    const d = new Date(today); d.setDate(d.getDate() + i);
    const dateStr = toYMD(d);
    const dow = d.getDay();
    const isHoliday = holidays.includes(dateStr);
    const isOrderDay = orderDays.includes(dow);
    calendar.push({ date: dateStr, dow, isHoliday, isOrderDay });
  }

  // 배송 불가 구간 탐지 (공휴일 연속 구간)
  const gaps: {start:string;end:string;days:number}[] = [];
  let gapStart: string | null = null;
  let gapDays = 0;
  calendar.forEach(day => {
    if (day.isHoliday || day.dow === 0) { // 일요일 + 공휴일
      if (!gapStart) gapStart = day.date;
      gapDays++;
    } else {
      if (gapStart && gapDays >= 2) gaps.push({ start: gapStart, end: day.date, days: gapDays });
      gapStart = null; gapDays = 0;
    }
  });

  // 가장 가까운 발주일 & D-day 계산
  const nextOrderDay = calendar.find(d => d.isOrderDay && d.date > todayStr);
  let dDay: number | null = null;
  let dDayType: 'D-2'|'D-1'|'당일'|'배송불가'|null = null;

  if (nextOrderDay) {
    const diff = Math.floor((new Date(nextOrderDay.date).getTime() - today.getTime()) / 86400000);
    dDay = diff;
    if (diff === 0) dDayType = '당일';
    else if (diff === 1) dDayType = 'D-1';
    else if (diff === 2) dDayType = 'D-2';
  }

  const inGap = gaps.some(g => todayStr >= g.start && todayStr <= g.end);
  if (inGap) dDayType = '배송불가';

  return NextResponse.json({
    today: todayStr, calendar, holidays,
    gaps, nextOrderDay: nextOrderDay?.date || null,
    dDay, dDayType,
  });
}
