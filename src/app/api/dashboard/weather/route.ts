import { NextResponse } from 'next/server';
import { getStoreCoords, getWeatherCondition, WEATHER_ICONS } from '@/lib/weather';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  let regionSido = '';
  if (storeId) {
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      regionSido = snap.data()?.regionSido || snap.data()?.region || '';
    } catch { /* ignore */ }
  }

  const coords = getStoreCoords(regionSido);

  try {
    // past_days=1: 어제 포함 / forecast_days=4: 오늘+3일
    const url = [
      `https://api.open-meteo.com/v1/forecast`,
      `?latitude=${coords.lat}&longitude=${coords.lng}`,
      `&current=temperature_2m,weathercode,precipitation_probability`,
      `&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max`,
      `&past_days=1&forecast_days=4`,
      `&timezone=Asia%2FSeoul`,
    ].join('');

    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ error: '날씨 조회 실패' }, { status: 502 });

    const data  = await res.json();
    const cur   = data.current || {};
    const daily = data.daily   || {};

    const days = (daily.time || []).map((dateStr: string, i: number) => {
      const code      = daily.weathercode?.[i] ?? 0;
      const condition = getWeatherCondition(code);
      return {
        date:       dateStr,
        condition,
        icon:       WEATHER_ICONS[condition] || '🌡️',
        tempMax:    Math.round(daily.temperature_2m_max?.[i]  ?? 0),
        tempMin:    Math.round(daily.temperature_2m_min?.[i]  ?? 0),
        precipProb: Math.round(daily.precipitation_probability_max?.[i] ?? 0),
      };
    });

    // 오늘 현재 기온은 current에서
    const todayStr  = new Date().toISOString().split('T')[0];
    const todayIdx  = days.findIndex((d: any) => d.date === todayStr);
    const currentTemp = Math.round(cur.temperature_2m ?? (todayIdx >= 0 ? days[todayIdx].tempMax : 0));

    return NextResponse.json({
      regionSido:  regionSido || '서울',
      currentTemp,
      days,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
