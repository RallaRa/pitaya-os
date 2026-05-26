export function getWeatherCondition(code: number): string {
  if (code === 0) return '맑음';
  if (code <= 3) return '구름';
  if (code <= 48) return '안개';
  if (code <= 67) return '비';
  if (code <= 77) return '눈';
  if (code <= 82) return '소나기';
  return '뇌우';
}

export const WEATHER_ICONS: Record<string, string> = {
  '맑음': '☀️', '구름': '⛅', '안개': '🌫️', '비': '🌧️', '눈': '❄️', '소나기': '🌦️', '뇌우': '⛈️',
};

const SIDO_COORDS: Record<string, { lat: number; lng: number }> = {
  '서울': { lat: 37.5665, lng: 126.9780 },
  '서울특별시': { lat: 37.5665, lng: 126.9780 },
  '부산': { lat: 35.1796, lng: 129.0756 },
  '부산광역시': { lat: 35.1796, lng: 129.0756 },
  '대구': { lat: 35.8714, lng: 128.6014 },
  '대구광역시': { lat: 35.8714, lng: 128.6014 },
  '인천': { lat: 37.4563, lng: 126.7052 },
  '인천광역시': { lat: 37.4563, lng: 126.7052 },
  '광주': { lat: 35.1595, lng: 126.8526 },
  '광주광역시': { lat: 35.1595, lng: 126.8526 },
  '대전': { lat: 36.3504, lng: 127.3845 },
  '대전광역시': { lat: 36.3504, lng: 127.3845 },
  '울산': { lat: 35.5384, lng: 129.3114 },
  '울산광역시': { lat: 35.5384, lng: 129.3114 },
  '세종': { lat: 36.4800, lng: 127.2890 },
  '세종특별자치시': { lat: 36.4800, lng: 127.2890 },
  '경기': { lat: 37.4138, lng: 127.5183 },
  '경기도': { lat: 37.4138, lng: 127.5183 },
  '강원': { lat: 37.8813, lng: 128.9062 },
  '강원도': { lat: 37.8813, lng: 128.9062 },
  '강원특별자치도': { lat: 37.8813, lng: 128.9062 },
  '충북': { lat: 36.6358, lng: 127.4915 },
  '충청북도': { lat: 36.6358, lng: 127.4915 },
  '충남': { lat: 36.5184, lng: 126.8001 },
  '충청남도': { lat: 36.5184, lng: 126.8001 },
  '전북': { lat: 35.7175, lng: 127.1530 },
  '전라북도': { lat: 35.7175, lng: 127.1530 },
  '전북특별자치도': { lat: 35.7175, lng: 127.1530 },
  '전남': { lat: 34.8679, lng: 126.9910 },
  '전라남도': { lat: 34.8679, lng: 126.9910 },
  '경북': { lat: 36.5760, lng: 128.5058 },
  '경상북도': { lat: 36.5760, lng: 128.5058 },
  '경남': { lat: 35.4606, lng: 128.2132 },
  '경상남도': { lat: 35.4606, lng: 128.2132 },
  '제주': { lat: 33.4996, lng: 126.5312 },
  '제주특별자치도': { lat: 33.4996, lng: 126.5312 },
};

const DEFAULT_COORDS = { lat: 37.5665, lng: 126.9780 };

export function getStoreCoords(regionSido?: string): { lat: number; lng: number } {
  if (!regionSido) return DEFAULT_COORDS;
  if (SIDO_COORDS[regionSido]) return SIDO_COORDS[regionSido];
  // 부분 매칭: "경기" → "경기도", "강원" → "강원특별자치도" 등
  const key = Object.keys(SIDO_COORDS).find(k => regionSido.startsWith(k) || k.startsWith(regionSido));
  return key ? SIDO_COORDS[key] : DEFAULT_COORDS;
}

export async function fetchWeather(
  dateStr: string,
  coords: { lat: number; lng: number } = DEFAULT_COORDS
): Promise<{ condition: string; tempMax: number; tempMin: number; rainMm?: number } | null> {
  try {
    const today = new Date().toISOString().slice(0, 10);
    const baseUrl = dateStr < today
      ? 'https://archive-api.open-meteo.com/v1/archive'
      : 'https://api.open-meteo.com/v1/forecast';
    const url = `${baseUrl}?latitude=${coords.lat}&longitude=${coords.lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
      `&timezone=Asia%2FSeoul&start_date=${dateStr}&end_date=${dateStr}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const code = json.daily?.weathercode?.[0];
    const tempMax = json.daily?.temperature_2m_max?.[0];
    const tempMin = json.daily?.temperature_2m_min?.[0];
    const rainMm  = json.daily?.precipitation_sum?.[0];
    if (code === undefined) return null;
    return {
      condition: getWeatherCondition(code),
      tempMax: Math.round(tempMax ?? 0),
      tempMin: Math.round(tempMin ?? 0),
      rainMm:  Math.round((rainMm ?? 0) * 10) / 10,
    };
  } catch {
    return null;
  }
}
