import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getStoreCoords, getWeatherCondition } from '@/lib/weather';
import { verifyToken } from '@/lib/authVerify';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';

interface PartnerItem { rank: number; item: string; action: string; expectedSales: string; reason: string; badge: string; }

interface GeminiPeriodData {
  period: string; opinion: string;
  topItems: PartnerItem[]; bottomItems: PartnerItem[];
  keyAlert: string; confidence: number;
  weekHighlight?: string;
  monthProgress?: string; salesForecast?: string;
}
interface GeminiResult {
  generatedAt: string;
  today: GeminiPeriodData; tomorrow: GeminiPeriodData;
  thisWeek: GeminiPeriodData; thisMonth: GeminiPeriodData;
  orderAdvice: { isOrderDay: boolean; dDay: string | null; comment: string; items: { item: string; orderRecommend: string; changeVsNormal: string }[] };
}

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}
function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g,'').replace(/&quot;/g,'"').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').trim();
}

const DOW_KO = ['일','월','화','수','목','금','토'];

async function fetchWeatherMultiDay(coords: {lat:number;lng:number}) {
  const today = toYMD(new Date());
  const end   = toYMD(new Date(Date.now() + 7 * 86400000));
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max&timezone=Asia%2FSeoul&start_date=${today}&end_date=${end}`;
    const r = await fetch(url, { signal: AbortSignal.timeout(6000) });
    const j = await r.json();
    const days = (j.daily?.time || []).map((date: string, i: number) => ({
      date,
      tempMax:   Math.round(j.daily.temperature_2m_max?.[i] ?? 20),
      tempMin:   Math.round(j.daily.temperature_2m_min?.[i] ?? 10),
      precipProb:Math.round(j.daily.precipitation_probability_max?.[i] ?? 0),
      condition: getWeatherCondition(j.daily.weathercode?.[i] ?? 0),
    }));
    return days;
  } catch { return []; }
}

async function fetchHolidayRange(apiKey: string, months: string[]) {
  const holidays: string[] = [];
  for (const ym of months) {
    try {
      const url = `http://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo?serviceKey=${apiKey}&solYear=${ym.slice(0,4)}&solMonth=${ym.slice(4,6)}&numOfRows=50&pageNo=1&_type=json`;
      const r = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const j = await r.json();
      const items = j?.response?.body?.items?.item || [];
      (Array.isArray(items) ? items : [items]).forEach((i: { locdate: string | number }) => holidays.push(String(i.locdate)));
    } catch {}
  }
  return holidays;
}

async function fetchNaverMultiNews() {
  const id  = process.env.NAVER_CLIENT_ID;
  const sec = process.env.NAVER_CLIENT_SECRET;
  if (!id || !sec) return [];
  const kws = ['정육','한우','돼지고기','축산물'];
  const news: {keyword:string;title:string;description:string;pubDate:string}[] = [];
  await Promise.allSettled(kws.map(async kw => {
    try {
      const q = encodeURIComponent(kw);
      const r = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${q}&display=3&sort=date`, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec },
        signal: AbortSignal.timeout(5000),
      });
      const j = await r.json();
      (j.items || []).slice(0,2).forEach((item: { title?: string; description?: string; pubDate?: string }) => {
        news.push({ keyword: kw, title: stripHtml(item.title||''), description: stripHtml(item.description||''), pubDate: item.pubDate||'' });
      });
    } catch {}
  }));
  return news.slice(0, 8);
}

async function fetchMeatData(base: string) {
  const [priceRes, auctionRes] = await Promise.allSettled([
    fetch(`${base}/api/external/meat-price`, { signal: AbortSignal.timeout(10000) }).then(r=>r.json()),
    fetch(`${base}/api/external/meat-auction`, { signal: AbortSignal.timeout(10000) }).then(r=>r.json()),
  ]);
  return {
    prices:  priceRes.status  === 'fulfilled' ? priceRes.value  : null,
    auction: auctionRes.status === 'fulfilled' ? auctionRes.value : null,
  };
}

async function fetchNaverTrend(_base: string, storeId: string) {
  return fetchNaverTrendData(storeId);
}

function isMidnightFresh(ts: any) {
  if (!ts) return false;
  const d = ts.toDate ? ts.toDate() : new Date(ts);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
}

async function fetchPosCustomers(storeId: string) {
  try {
    return await adminDb.collection('pos_customers')
      .where('storeId', '==', storeId)
      .orderBy('point', 'desc')
      .limit(200)
      .get();
  } catch {
    const snap = await adminDb.collection('pos_customers')
      .where('storeId', '==', storeId)
      .limit(200)
      .get();
    const sorted = [...snap.docs].sort(
      (a, b) => (b.data().point || 0) - (a.data().point || 0),
    );
    return { docs: sorted, empty: sorted.length === 0, size: sorted.length };
  }
}

async function collectFirestoreData(storeId: string) {
  const since90  = toYMD(new Date(Date.now() - 90  * 86400000));
  const since365 = toYMD(new Date(Date.now() - 365 * 86400000));

  const [headerSnap, detailSnap, finishSnap, custSnap, varSnap] = await Promise.allSettled([
    adminDb.collection('pos_sales_header')
      .where('storeId','==',storeId).where('date','>=',since365.replace(/-/g,'')).orderBy('date','desc').limit(365).get(),
    adminDb.collection('pos_sales_detail')
      .where('storeId','==',storeId).where('date','>=',since90.replace(/-/g,'')).orderBy('date','desc').limit(2000).get(),
    adminDb.collection('pos_finish_total')
      .where('storeId','==',storeId).where('date','>=',since90.replace(/-/g,'')).orderBy('date','desc').limit(90).get(),
    fetchPosCustomers(storeId),
    adminDb.collection('weather_impact_variables').doc(storeId || 'global').get(),
  ]);
  // 365일 일별 매출 추이
  const dailyTotals: {date:string;totalSale:number;transCount:number}[] = [];
  if (headerSnap.status === 'fulfilled') {
    headerSnap.value.docs.forEach(d => {
      const r = d.data();
      dailyTotals.push({ date: r.date, totalSale: r.totalSale||0, transCount: r.transCount||0 });
    });
  }

  // 90일 품목별 집계
  const itemMap: Record<string, {qty:number;amount:number;days:Set<string>}> = {};
  if (detailSnap.status === 'fulfilled') {
    detailSnap.value.docs.forEach(d => {
      const r = d.data();
      const name = r.goodsName || '';
      if (!name) return;
      if (!itemMap[name]) itemMap[name] = { qty:0, amount:0, days: new Set() };
      itemMap[name].qty += Number(r.saleCount||0);
      itemMap[name].amount += Number(r.totalPrice||0);
      itemMap[name].days.add(r.date||'');
    });
  }
  const topItems90 = Object.entries(itemMap)
    .map(([name,v]) => ({ name, qty: v.qty, amount: v.amount, days: v.days.size }))
    .sort((a,b) => b.qty - a.qty).slice(0, 30);

  // 90일 일마감 통계
  const closures: {date:string;netSale:number;totalSale:number}[] = [];
  if (finishSnap.status === 'fulfilled') {
    finishSnap.value.docs.forEach(d => {
      const r = d.data();
      closures.push({ date: r.date, netSale: r.netSale||0, totalSale: r.totalSale||0 });
    });
  }

  // 고객 분포
  let custStats = { total:0, gradeA:0, gradeB:0, gradeC:0, avgPoint:0 };
  if (custSnap.status === 'fulfilled') {
    const docs = custSnap.value.docs;
    custStats.total = docs.length;
    let pts = 0;
    docs.forEach(d => {
      const r = d.data();
      pts += r.point||0;
      const g = (r.grade||'').toUpperCase();
      if (g === 'A' || g === 'VIP') custStats.gradeA++;
      else if (g === 'B' || g === 'REGULAR') custStats.gradeB++;
      else custStats.gradeC++;
    });
    custStats.avgPoint = docs.length > 0 ? Math.round(pts/docs.length) : 0;
  }

  // 날씨 변수
  let activeVarCount = 0;
  if (varSnap.status === 'fulfilled' && varSnap.value.exists) {
    activeVarCount = (varSnap.value.data()?.variables||[]).filter((v:any) => v.active).length;
  }

  return { dailyTotals, topItems90, closures, custStats, activeVarCount };
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const refresh = searchParams.get('refresh') === '1';
  const today   = toYMD(new Date());
  const cacheRef = adminDb.collection('ai_partner_predictions').doc(`${storeId||'global'}_${today}`);

  // 캐시 확인 (당일 자정까지 유효)
  if (!refresh) {
    try {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const d = cached.data()!;
        if (isMidnightFresh(d.generatedAt)) {
          return NextResponse.json({ ...d, cached: true });
        }
      }
    } catch {}
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      error: 'GEMINI_API_KEY 미설정',
      today: null, tomorrow: null, thisWeek: null, thisMonth: null,
      noData: true, cached: false,
    }, { status: 200 });
  }

  const base    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
  const apiKey  = process.env.PUBLIC_DATA_API_KEY || '';
  const now     = new Date();
  const todayNum = today.replace(/-/g,'');
  const thisYM   = today.slice(0,7).replace('-','');
  const nextYM   = (() => {
    const d = new Date(now.getFullYear(), now.getMonth()+1, 1);
    return `${d.getFullYear()}${String(d.getMonth()+1).padStart(2,'0')}`;
  })();

  const coords = storeId ? await (async () => {
    try {
      const s = await adminDb.collection('stores').doc(storeId).get();
      return getStoreCoords(s.data()?.regionSido || '');
    } catch { return { lat:37.5665, lng:126.9780 }; }
  })() : { lat:37.5665, lng:126.9780 };

  const [
    weatherRes, holidaysRes, newsRes, meatRes, trendRes, firestoreRes,
  ] = await Promise.allSettled([
    fetchWeatherMultiDay(coords),
    apiKey ? fetchHolidayRange(apiKey, [thisYM, nextYM]) : Promise.resolve([]),
    fetchNaverMultiNews(),
    fetchMeatData(base),
    fetchNaverTrend(base, storeId),
    collectFirestoreData(storeId),
  ]);

  const weatherDays = weatherRes.status === 'fulfilled' ? weatherRes.value : [];
  const holidays    = holidaysRes.status === 'fulfilled' ? holidaysRes.value : [];
  const news        = newsRes.status === 'fulfilled' ? newsRes.value : [];
  const meat        = meatRes.status === 'fulfilled' ? meatRes.value : { prices: null, auction: null };
  const trend       = trendRes.status === 'fulfilled' ? trendRes.value : null;
  const fs          = firestoreRes.status === 'fulfilled' ? firestoreRes.value : {
    dailyTotals:[], topItems90:[], closures:[], custStats:{total:0,gradeA:0,gradeB:0,gradeC:0,avgPoint:0}, activeVarCount:0,
  };

  // 날짜 컨텍스트
  const todayDow     = now.getDay();
  const tomorrowDate = new Date(now.getTime() + 86400000);
  const tomorrowStr  = toYMD(tomorrowDate);
  const isHoliday    = holidays.includes(todayNum);
  const isTmrHoliday = holidays.includes(tomorrowStr.replace(/-/g,''));
  const isPayDay     = (d: number) => d >= 23 && d <= 28;
  const monthDay     = now.getDate();
  const daysInMonth  = new Date(now.getFullYear(), now.getMonth()+1, 0).getDate();
  const daysLeft     = daysInMonth - monthDay;

  // 주간 날짜 범위
  const weekStart = new Date(now); weekStart.setDate(now.getDate() - todayDow + 1);
  const weekEnd   = new Date(weekStart); weekEnd.setDate(weekStart.getDate() + 6);
  const weekRange = `${String(weekStart.getMonth()+1).padStart(2,'0')}/${String(weekStart.getDate()).padStart(2,'0')}~${String(weekEnd.getMonth()+1).padStart(2,'0')}/${String(weekEnd.getDate()).padStart(2,'0')}`;

  // 판매 데이터 요약
  const hasData = fs.topItems90.length > 0;
  const salesSummary = fs.topItems90.slice(0,20).map(i =>
    `${i.name}: 90일합계 ${i.qty}개/${(i.amount/10000).toFixed(0)}만원, ${i.days}일판매`
  ).join('\n');

  // 일별 매출 요약 (최근 30일 평균)
  const recent30 = fs.dailyTotals.slice(0,30);
  const avgDailySale = recent30.length > 0 ? Math.round(recent30.reduce((s,d)=>s+d.totalSale,0)/recent30.length) : 0;
  const maxDailySale = recent30.length > 0 ? Math.max(...recent30.map(d=>d.totalSale)) : 0;

  // 요일별 평균
  const dowAvg: Record<number, {sum:number;cnt:number}> = {0:{sum:0,cnt:0},1:{sum:0,cnt:0},2:{sum:0,cnt:0},3:{sum:0,cnt:0},4:{sum:0,cnt:0},5:{sum:0,cnt:0},6:{sum:0,cnt:0}};
  fs.dailyTotals.forEach(d => {
    const dateObj = new Date(d.date.slice(0,4)+'-'+d.date.slice(4,6)+'-'+d.date.slice(6,8));
    const dow = dateObj.getDay();
    dowAvg[dow].sum += d.totalSale; dowAvg[dow].cnt++;
  });
  const dowStats = Object.entries(dowAvg).map(([dow, v]) => ({
    dow: DOW_KO[Number(dow)], avg: v.cnt>0 ? Math.round(v.sum/v.cnt) : 0,
  }));

  // 날씨 텍스트
  const weatherText = weatherDays.slice(0,7).map(d => {
    const dateObj = new Date(d.date);
    return `${d.date}(${DOW_KO[dateObj.getDay()]}): ${d.condition} 최고${d.tempMax}°/최저${d.tempMin}° 강수${d.precipProb}%`;
  }).join('\n');

  // 시세 텍스트
  const priceText = meat.prices?.prices?.length > 0
    ? meat.prices.prices.map((p: { itemName: string; price: number; unit: string }) => `${p.itemName}: ${p.price.toLocaleString()}원/${p.unit}`).join('\n')
    : '데이터없음';
  const auctionText = meat.auction?.auction
    ? `평균${meat.auction.auction.avgPrice?.toLocaleString()}원 최고${meat.auction.auction.maxPrice?.toLocaleString()}원 (${meat.auction.auction.count}두)`
    : '데이터없음';

  // 트렌드 텍스트
  const trendText = trend?.trends?.length > 0
    ? trend.trends.map((t: { groupName: string; current: number; change: number }) => `${t.groupName}: 검색지수${t.current} 전일대비${t.change > 0 ? '+' : ''}${t.change}%`).join('\n')
    : (trend?.error || '데이터없음');

  // 뉴스 텍스트
  const newsText = news.length > 0
    ? news.map(n => `[${n.keyword}] ${n.title}: ${n.description.slice(0,60)}`).join('\n')
    : '데이터없음';

  const dataStatus = {
    salesHistory: { status: fs.topItems90.length > 0 ? 'ok' : 'empty', days: Math.min(90, fs.dailyTotals.length) },
    weather:      { status: weatherDays.length > 0 ? 'ok' : 'error' },
    meatPrice:    { status: meat.prices?.prices?.length > 0 ? 'ok' : 'error' },
    trendData:    { status: trend?.trends?.length > 0 ? 'ok' : trend?.noKeywords ? 'empty' : 'error', detail: trend?.error },
    newsData:     { status: news.length > 0 ? 'ok' : 'error', count: news.length },
  };

  if (!hasData) {
    const fallback = {
      generatedAt: new Date().toISOString(),
      noData: true,
      today:     { period:`오늘 ${today}(${DOW_KO[todayDow]})`, opinion:'**일마감 데이터를 꾸준히 입력**하면 AI가 정확한 운영 의견을 제공합니다. POS 브릿지 또는 수동 입력으로 데이터를 쌓아주세요.', topItems:[], bottomItems:[], keyAlert:'데이터 부족', confidence:0 },
      tomorrow:  { period:`내일 ${tomorrowStr}(${DOW_KO[tomorrowDate.getDay()]})`, opinion:'데이터 축적 후 분석 가능합니다.', topItems:[], bottomItems:[], keyAlert:'', confidence:0 },
      thisWeek:  { period:`이번주 ${weekRange}`, opinion:'데이터 축적 후 분석 가능합니다.', topItems:[], bottomItems:[], keyAlert:'', weekHighlight:'', confidence:0 },
      thisMonth: { period:`이번달 ${now.getFullYear()}년 ${now.getMonth()+1}월`, opinion:'데이터 축적 후 분석 가능합니다.', topItems:[], bottomItems:[], keyAlert:'', monthProgress:`${monthDay}일 경과 / ${daysLeft}일 남음`, salesForecast:'예측불가', confidence:0 },
      orderAdvice: { isOrderDay:false, dDay:null, comment:'데이터 부족', items:[] },
      dataSourceStatus: dataStatus,
      cached: false,
    };
    await cacheRef.set(fallback).catch(()=>{});
    return NextResponse.json(fallback);
  }

  const prompt = `너는 정육점 AI 토탈 운영파트너야. 아래 데이터를 종합 분석해서 4개 기간별 운영 의견을 JSON으로만 반환해. 순수 JSON만 반환. 마크다운 없음.

[날짜정보]
오늘: ${today}(${DOW_KO[todayDow]}) ${isHoliday?'공휴일':''}${isPayDay(monthDay)?'급여일인근':''}
내일: ${tomorrowStr}(${DOW_KO[tomorrowDate.getDay()]}) ${isTmrHoliday?'공휴일':''}
이번주: ${weekRange}
이번달: ${now.getFullYear()}년${now.getMonth()+1}월 (${monthDay}일경과/${daysLeft}일남음)

[요일별 평균 매출]
${dowStats.map(d=>`${d.dow}요일: 평균${d.avg.toLocaleString()}원`).join(' | ')}
30일평균일매출: ${avgDailySale.toLocaleString()}원 / 최고: ${maxDailySale.toLocaleString()}원

[90일 품목별 판매 TOP20]
${salesSummary}

[7일 날씨 예보]
${weatherText}

[축산물 소비자가격]
${priceText}

[소도체 도매경매가]
${auctionText}

[소비자 검색트렌드]
${trendText}

[관련 뉴스]
${newsText}

[고객 현황]
등록고객 ${fs.custStats.total}명 (A등급${fs.custStats.gradeA}/B등급${fs.custStats.gradeB}/C등급${fs.custStats.gradeC}) 평균포인트${fs.custStats.avgPoint}

반환 JSON (정확히 이 구조):
{
  "generatedAt": "${new Date().toISOString()}",
  "today": {
    "period": "오늘 ${today}(${DOW_KO[todayDow]})",
    "opinion": "300자이내. 오늘 당장 할 것 중심. **볼드** 사용.",
    "topItems": [{"rank":1,"item":"품목명","action":"진열늘리기","expectedSales":"예상판매량","reason":"근거","badge":"HOT"}],
    "bottomItems": [{"rank":1,"item":"품목명","action":"재고최소화","expectedSales":"예상판매량","reason":"근거","badge":"주의"}],
    "keyAlert": "오늘 가장 중요한 한가지",
    "confidence": 85
  },
  "tomorrow": {
    "period": "내일 ${tomorrowStr}(${DOW_KO[tomorrowDate.getDay()]})",
    "opinion": "300자이내. 내일 준비 중심.",
    "topItems": [5개],
    "bottomItems": [5개],
    "keyAlert": "내일 가장 중요한 한가지",
    "confidence": 80
  },
  "thisWeek": {
    "period": "이번주 ${weekRange}",
    "opinion": "300자이내. 주간 운영전략 중심.",
    "topItems": [5개],
    "bottomItems": [5개],
    "keyAlert": "이번주 가장 중요한 한가지",
    "weekHighlight": "이번주 특이사항",
    "confidence": 72
  },
  "thisMonth": {
    "period": "이번달 ${now.getFullYear()}년 ${now.getMonth()+1}월",
    "opinion": "300자이내. 월간 매출전략 중심.",
    "topItems": [5개],
    "bottomItems": [5개],
    "keyAlert": "이번달 가장 중요한 한가지",
    "monthProgress": "${monthDay}일 경과 / ${daysLeft}일 남음",
    "salesForecast": "이번달 예상 총매출 (숫자+원)",
    "confidence": 65
  },
  "orderAdvice": {
    "isOrderDay": false,
    "dDay": null,
    "comment": "발주 관련 의견 200자이내",
    "items": [{"item":"품목명","orderRecommend":"발주권장량","changeVsNormal":"+20%"}]
  }
}
topItems/bottomItems badge는: HOT(+30%↑) | UP(+10~30%) | 주의(-10%↓) | 추천(최적조건)`;

  let result: GeminiResult | null = null;
  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash', generationConfig: { temperature: 0.3 } });
    const res   = await model.generateContent(prompt);
    const text  = res.response.text().trim().replace(/^```json\s*/,'').replace(/\s*```$/,'').trim();
    result = JSON.parse(text) as GeminiResult;
  } catch (e: unknown) {
    // Gemini 실패 시 최소 폴백
    result = {
      generatedAt: new Date().toISOString(),
      today:     { period:`오늘 ${today}(${DOW_KO[todayDow]})`, opinion:'**AI 분석 일시 오류**입니다. 이전 캐시 또는 수동 판단을 활용하세요.', topItems:[], bottomItems:[], keyAlert:'AI 오류', confidence:0 },
      tomorrow:  { period:`내일 ${tomorrowStr}`, opinion:'AI 분석 오류', topItems:[], bottomItems:[], keyAlert:'', confidence:0 },
      thisWeek:  { period:`이번주 ${weekRange}`, opinion:'AI 분석 오류', topItems:[], bottomItems:[], keyAlert:'', weekHighlight:'', confidence:0 },
      thisMonth: { period:`이번달 ${now.getFullYear()}년${now.getMonth()+1}월`, opinion:'AI 분석 오류', topItems:[], bottomItems:[], keyAlert:'', monthProgress:`${monthDay}일 경과`, salesForecast:'예측불가', confidence:0 },
      orderAdvice: { isOrderDay:false, dDay:null, comment:'AI 분석 오류', items:[] },
    };
  }

  const finalResult = {
    ...result,
    dataSourceStatus: dataStatus,
    cached: false,
  };

  // 캐시 저장
  await cacheRef.set({ ...finalResult, generatedAt: FieldValue.serverTimestamp() }).catch(()=>{});

  // 정합성 추적 - 오늘 예측 저장 (today/tomorrow)
  const accuracyBase = adminDb.collection('ai_partner_accuracy');
  const periods = [
    { key:'today', data: result.today },
    { key:'tomorrow', data: result.tomorrow },
    { key:'thisWeek', data: result.thisWeek },
    { key:'thisMonth', data: result.thisMonth },
  ];
  await Promise.allSettled(periods.map(p => {
    if (!p.data?.topItems) return Promise.resolve();
    return accuracyBase.doc(`${storeId||'global'}_${today}_${p.key}`).set({
      predictionDate: today,
      period: p.key,
      storeId: storeId||'global',
      predictedTopItems:    (p.data.topItems||[]).map((i: PartnerItem) => i.item),
      predictedBottomItems: (p.data.bottomItems||[]).map((i: PartnerItem) => i.item),
      predictedOpinion: p.data.opinion||'',
      confidence: p.data.confidence||0,
      actualTopItems:    null,
      actualBottomItems: null,
      accuracyScore:     null,
      verifiedAt:        null,
      createdAt:         FieldValue.serverTimestamp(),
    }, { merge: false });
  }));

  // 어제 정합성 자동 검증 (실제 데이터 있으면)
  const yesterday = toYMD(new Date(Date.now() - 86400000));
  try {
    const yesterdayNum = yesterday.replace(/-/g,'');
    const actualSnap = await adminDb.collection('pos_sales_detail')
      .where('storeId','==',storeId).where('date','==',yesterdayNum).orderBy('saleCount','desc').limit(10).get();
    if (!actualSnap.empty) {
      const actualTop = actualSnap.docs.map(d => d.data().goodsName||'').filter(Boolean).slice(0,5);
      const predRef = accuracyBase.doc(`${storeId||'global'}_${yesterday}_today`);
      const predDoc = await predRef.get();
      if (predDoc.exists && !predDoc.data()?.accuracyScore) {
        const predicted: string[] = predDoc.data()?.predictedTopItems || [];
        const matches = predicted.filter(n => actualTop.includes(n)).length;
        const score = Math.round((matches / Math.max(predicted.length, 1)) * 100);
        await predRef.update({ actualTopItems: actualTop, accuracyScore: score, verifiedAt: FieldValue.serverTimestamp() });
      }
    }
  } catch {}

  return NextResponse.json({ ...finalResult, cached: false });
}
