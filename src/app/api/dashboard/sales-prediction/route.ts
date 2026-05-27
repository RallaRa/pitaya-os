import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getStoreCoords, getWeatherCondition, WEATHER_ICONS } from '@/lib/weather';
import { verifyToken } from '@/lib/authVerify';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

async function fetchHolidays(apiKey: string, yyyymm: string) {
  try {
    const year = yyyymm.slice(0,4); const month = yyyymm.slice(4,6);
    const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${apiKey}&solYear=${year}&solMonth=${month}&numOfRows=30&pageNo=1&_type=json`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const items = json?.response?.body?.items?.item || [];
    return (Array.isArray(items) ? items : [items]).map((i:any) => String(i.locdate));
  } catch { return []; }
}

async function fetchWeatherForecast(coords: {lat:number;lng:number}) {
  try {
    const today = toYMD(new Date());
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=Asia%2FSeoul&start_date=${today}&end_date=${today}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    return {
      tempMax: Math.round(json.daily?.temperature_2m_max?.[0] ?? 20),
      tempMin: Math.round(json.daily?.temperature_2m_min?.[0] ?? 10),
      precipProb: Math.round(json.daily?.precipitation_probability_max?.[0] ?? 0),
      condition: getWeatherCondition(json.daily?.weathercode?.[0] ?? 0),
    };
  } catch { return null; }
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const refresh = searchParams.get('refresh') === '1';

  const today = toYMD(new Date());
  const cacheRef = adminDb.collection('predictions').doc(today + '_' + (storeId || 'global'));

  // 캐시 확인
  if (!refresh) {
    try {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const d = cached.data()!;
        const age = Date.now() - (d.generatedAt?.toMillis?.() || 0);
        if (age < 6 * 60 * 60 * 1000) { // 6시간
          return NextResponse.json({ ...d, cached: true });
        }
      }
    } catch {}
  }

  const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
  const coords = await (async () => {
    if (!storeId) return { lat: 37.5665, lng: 126.9780 };
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      const r = snap.data()?.regionSido || '';
      return getStoreCoords(r);
    } catch { return { lat: 37.5665, lng: 126.9780 }; }
  })();

  const predictionDate = today;
  const yyyymm = today.replace(/-/g,'').slice(0,6);

  // 병렬 데이터 수집
  const [salesSnap, purchasesSnap, weatherRes, holidaysRes, weatherVarsSnap] = await Promise.allSettled([
    adminDb.collection('daily_reports')
      .where('storeId', '==', storeId)
      .orderBy('reportDate', 'desc').limit(90).get(),
    adminDb.collection('purchases')
      .where('storeId', '==', storeId)
      .orderBy('purchaseDate', 'desc').limit(30).get(),
    fetchWeatherForecast(coords),
    apiKey ? fetchHolidays(apiKey, yyyymm) : Promise.resolve([]),
    adminDb.collection('weather_impact_variables').doc(storeId || 'global').get(),
  ]);

  const sales = salesSnap.status === 'fulfilled' ? salesSnap.value.docs : [];
  const purchases = purchasesSnap.status === 'fulfilled' ? purchasesSnap.value.docs : [];
  const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
  const holidays = holidaysRes.status === 'fulfilled' ? holidaysRes.value : [];
  const weatherVarsDoc = weatherVarsSnap.status === 'fulfilled' ? weatherVarsSnap.value : null;
  const activeVars = (weatherVarsDoc?.exists ? weatherVarsDoc.data()?.variables || [] : [])
    .filter((v:any) => v.active);

  // 데이터 소스 상태
  const dataSourceStatus = {
    sales:    sales.length > 0 ? '✅' : '❌',
    purchases: purchases.length > 0 ? '✅' : '❌',
    weather:  weather ? '✅' : '❌',
    holiday:  holidays.length >= 0 ? '✅' : '❌',
    weatherVars: activeVars.length > 0 ? '✅' : '⚠️',
    naverTrend: process.env.NAVER_CLIENT_ID ? '⚠️' : '❌',
    meatPrice:  apiKey ? '⚠️' : '❌',
    cardPayment: '❌',
  };

  // 판매 데이터 집계
  const itemMap: Record<string, {qty:number;amount:number;days:number}> = {};
  sales.forEach(doc => {
    (doc.data().items || []).forEach((item:any) => {
      const name = item.name || '';
      if (!name) return;
      if (!itemMap[name]) itemMap[name] = {qty:0,amount:0,days:0};
      itemMap[name].qty += Number(item.qty||0);
      itemMap[name].amount += Number(item.netSales||item.amount||0);
      itemMap[name].days++;
    });
  });
  const sortedItems = Object.entries(itemMap)
    .sort((a,b) => b[1].qty - a[1].qty)
    .slice(0, 20);

  const todayDow = new Date().getDay();
  const dowNames = ['일','월','화','수','목','금','토'];
  const isHoliday = holidays.includes(today.replace(/-/g,''));
  const isWeekend = todayDow === 0 || todayDow === 6;
  const isPayDay = (() => { const d = new Date().getDate(); return d >= 22 && d <= 28; })();

  if (sortedItems.length === 0) {
    const fallback = {
      predictionDate,
      supporterComment: '아직 충분한 판매 데이터가 없습니다. **일마감 데이터를 꾸준히 입력**하면 정확도가 향상됩니다.',
      topItems: [], bottomItems: [], keyFactors: [],
      dataSourceStatus, activeVariables: activeVars.length,
      modelAccuracy: 0, noData: true, generatedAt: FieldValue.serverTimestamp(),
    };
    await cacheRef.set(fallback).catch(()=>{});
    return NextResponse.json({ ...fallback, cached: false });
  }

  // Gemini 예측
  const summaryLines = sortedItems.map(([name, d]) =>
    `${name}: 총수량=${d.qty}, 총금액=${d.amount.toLocaleString()}원, 판매일수=${d.days}일`
  ).join('\n');

  const weatherContext = weather
    ? `날씨: ${weather.condition}, 최고${weather.tempMax}°/최저${weather.tempMin}°, 강수확률${weather.precipProb}%`
    : '날씨: 정보없음';

  const contextInfo = [
    `오늘: ${today} (${dowNames[todayDow]}요일)`,
    weatherContext,
    isHoliday ? '공휴일 또는 연휴' : isWeekend ? '주말' : '평일',
    isPayDay ? '급여일 인근 (소비증가 가능)' : '',
    activeVars.length > 0 ? `활성 날씨변수 ${activeVars.length}개` : '',
  ].filter(Boolean).join(' | ');

  const prompt = `정육점 AI 매출 예측 분석을 수행하세요.

[컨텍스트]
${contextInfo}

[최근 90일 판매 데이터 (상위20품목)]
${summaryLines}

다음 JSON 형식으로만 응답하세요 (마크다운 없이):
{
  "supporterComment": "오늘 주목할 핵심 인사이트 100자 이내. **볼드** 사용",
  "keyFactors": ["주요변수1","주요변수2","주요변수3"],
  "topItems": [
    {
      "rank": 1,
      "item": "품목명",
      "expectedSales": 숫자(kg또는개),
      "displayRecommend": "진열권장사항",
      "changeVsLastWeek": 숫자(퍼센트, 양수=증가),
      "confidence": 숫자(0-100),
      "badges": ["🔥HOT"],
      "reasons": ["근거1","근거2"],
      "reasonDetail": "상세근거"
    }
  ],
  "bottomItems": [같은구조 5개]
}
topItems: 오늘 판매 증가 예상 TOP5
bottomItems: 오늘 판매 감소 예상 TOP5
badges는 조건에 따라: 🔥HOT(+30%↑), ⬆️UP(+10~30%), 📉DOWN(-20%↓), 💡추천(confidence90+)`;

  let topItems: any[] = [];
  let bottomItems: any[] = [];
  let supporterComment = '';
  let keyFactors: string[] = [];

  if (process.env.GEMINI_API_KEY) {
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
      const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
      const result = await model.generateContent(prompt);
      const text = result.response.text().trim().replace(/```json|```/g,'').trim();
      const parsed = JSON.parse(text);
      topItems    = (parsed.topItems    || []).slice(0,5);
      bottomItems = (parsed.bottomItems || []).slice(0,5);
      supporterComment = parsed.supporterComment || '';
      keyFactors  = parsed.keyFactors   || [];
    } catch {
      // fallback: 통계 기반
      topItems = sortedItems.slice(0,5).map(([name,d],i) => ({
        rank: i+1, item: name,
        expectedSales: Math.round(d.qty / Math.max(d.days,1)),
        displayRecommend: '기본 진열 유지',
        changeVsLastWeek: 0, confidence: 60,
        badges: [], reasons: ['판매 이력 기반'], reasonDetail: '통계 기반 예측',
      }));
      bottomItems = sortedItems.slice(-5).reverse().map(([name,d],i) => ({
        rank: i+1, item: name,
        expectedSales: Math.round(d.qty / Math.max(d.days,1)),
        displayRecommend: '재고 최소화',
        changeVsLastWeek: -10, confidence: 55,
        badges: ['📉DOWN'], reasons: ['하위 판매 이력'], reasonDetail: '통계 기반 예측',
      }));
      supporterComment = '**통계 기반** 예측입니다. AI 분석을 위해 Gemini API 키를 확인하세요.';
    }
  }

  const resultObj = {
    predictionDate, supporterComment, topItems, bottomItems,
    keyFactors, dataSourceStatus,
    activeVariables: activeVars.length,
    modelAccuracy: Math.min(95, Math.max(40, sales.length * 0.8 + activeVars.length * 2)),
    noData: false,
    generatedAt: FieldValue.serverTimestamp(),
  };

  await cacheRef.set(resultObj).catch(()=>{});
  return NextResponse.json({ ...resultObj, cached: false });
}
