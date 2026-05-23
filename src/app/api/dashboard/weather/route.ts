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
  const today  = new Date().toISOString().split('T')[0];

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&current=temperature_2m,weathercode,precipitation_probability&daily=temperature_2m_max,temperature_2m_min,weathercode&timezone=Asia%2FSeoul&start_date=${today}&end_date=${today}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
    if (!res.ok) return NextResponse.json({ error: '날씨 조회 실패' }, { status: 502 });

    const data      = await res.json();
    const cur       = data.current || {};
    const daily     = data.daily   || {};
    const code      = cur.weathercode ?? daily.weathercode?.[0] ?? 0;
    const condition = getWeatherCondition(code);

    return NextResponse.json({
      condition,
      icon:       WEATHER_ICONS[condition] || '🌡️',
      temp:       Math.round(cur.temperature_2m ?? 0),
      tempMax:    Math.round(daily.temperature_2m_max?.[0] ?? 0),
      tempMin:    Math.round(daily.temperature_2m_min?.[0] ?? 0),
      precipProb: Math.round(cur.precipitation_probability ?? 0),
      regionSido: regionSido || '서울',
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
