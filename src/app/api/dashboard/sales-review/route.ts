import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback, hasAnyAiProvider } from '@/lib/aiProviderFallback';
import { adminDb } from '@/lib/firebase/admin';
import { getStoreCoords, fetchWeather } from '@/lib/weather';
import { getCompareDates, formatCompareDate, topItems, aggregateTimeSlotsFromItems } from '@/lib/reportCompare';
import { getKSTTodayYMD } from '@/lib/dateUtils';

function stripHtml(s: string) {
  return s.replace(/<[^>]+>/g, '').replace(/&quot;/g, '"').replace(/&amp;/g, '&').trim();
}

function getKSTHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }).format(new Date()),
  );
}

async function fetchNaverNews() {
  const id = process.env.NAVER_CLIENT_ID;
  const sec = process.env.NAVER_CLIENT_SECRET;
  if (!id || !sec) return [];
  const kws = ['정육', '한우', '돼지고기', '축산물'];
  const news: { keyword: string; title: string; description: string }[] = [];
  await Promise.allSettled(kws.map(async kw => {
    try {
      const q = encodeURIComponent(kw);
      const r = await fetch(`https://openapi.naver.com/v1/search/news.json?query=${q}&display=2&sort=date`, {
        headers: { 'X-Naver-Client-Id': id, 'X-Naver-Client-Secret': sec },
        signal: AbortSignal.timeout(5000),
      });
      const j = await r.json();
      (j.items || []).slice(0, 2).forEach((item: { title?: string; description?: string }) => {
        news.push({ keyword: kw, title: stripHtml(item.title || ''), description: stripHtml(item.description || '') });
      });
    } catch { /* skip */ }
  }));
  return news.slice(0, 6);
}

async function fetchExternalContext(base: string, storeId: string) {
  const [meatPrice, meatAuction, naverTrend] = await Promise.allSettled([
    fetch(`${base}/api/external/meat-price`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    fetch(`${base}/api/external/meat-auction`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
    fetch(`${base}/api/external/naver-trend${storeId ? `?storeId=${storeId}` : ''}`, { signal: AbortSignal.timeout(8000) }).then(r => r.json()),
  ]);
  return {
    meatPrice: meatPrice.status === 'fulfilled' ? meatPrice.value : null,
    meatAuction: meatAuction.status === 'fulfilled' ? meatAuction.value : null,
    naverTrend: naverTrend.status === 'fulfilled' ? naverTrend.value : null,
  };
}

function netFromDoc(d: FirebaseFirestore.DocumentData | null | undefined): number {
  if (!d) return 0;
  const t = d.totalSales ?? 0;
  return (d.netSales != null && d.netSales !== 0) ? d.netSales
    : (d.netSale != null && d.netSale !== 0) ? d.netSale
    : t - (d.returnAmount ?? 0) - (d.discountAmount ?? 0);
}

function slotsUpToHour(
  items: Array<{ time?: string; amount?: number; netSales?: number; qty?: number }> | undefined,
  posBreakdown: unknown,
  maxHour: number,
) {
  const slots = aggregateTimeSlotsFromItems(items, posBreakdown as any);
  const limits = [12, 14, 18, 21, 24];
  let total = 0;
  let count = 0;
  for (let i = 0; i < slots.length; i++) {
    const limit = limits[i];
    if (maxHour >= (i === 0 ? 9 : limits[i - 1])) {
      total += slots[i].total;
      count += slots[i].count;
    }
    if (maxHour < limit) break;
  }
  return { total, count };
}

function fmtSnap(label: string, date: string, snap: { netSales?: number; totalSales?: number; customerCount?: number } | null | undefined) {
  const net = snap?.netSales ?? 0;
  return `${label}(${date}): 순매출 ${net.toLocaleString()}원, 객수 ${snap?.customerCount ?? 0}명`;
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  if (!hasAnyAiProvider()) return NextResponse.json({ error: 'AI API 키 미설정' }, { status: 500 });

  try {
    const body = await req.json();
    const {
      storeId,
      date,
      todayData,
      compareData,
      compareDates,
      isClosed,
      weather,
      issues,
      news,
      rangeContext,
    } = body;

    const kstToday = getKSTTodayYMD();
    const kstHour = getKSTHour();
    const isToday = date === kstToday;
    const inProgress = isToday && isClosed === false;

    const dates = compareDates || getCompareDates(date);
    const base = process.env.NEXT_PUBLIC_APP_URL || `https://${req.headers.get('host') || 'pitaya-osv1.vercel.app'}`;

    const [naverNews, external, storeDoc, recentSnap] = await Promise.all([
      fetchNaverNews(),
      storeId ? fetchExternalContext(base, storeId) : Promise.resolve({ meatPrice: null, meatAuction: null, naverTrend: null }),
      storeId ? adminDb.collection('stores').doc(storeId).get() : Promise.resolve(null),
      storeId ? adminDb.collection('daily_reports')
        .where('storeId', '==', storeId)
        .where('reportDate', '>=', date.slice(0, 8) + '01')
        .where('reportDate', '<=', date)
        .limit(31)
        .get()
        : Promise.resolve(null),
    ]);

    const regionSido = storeDoc?.exists ? (storeDoc.data() as { regionSido?: string })?.regionSido : undefined;
    let weatherText = '';
    if (weather && typeof weather === 'object') {
      weatherText = `${weather.condition} ${weather.tempMin}~${weather.tempMax}°C`;
    } else if (date) {
      const w = await fetchWeather(date, getStoreCoords(regionSido));
      if (w) weatherText = `${w.condition} ${w.tempMin}~${w.tempMax}°C`;
    }

    const storedNews = news?.title ? `저장뉴스: ${news.title}` : '';
    const issueText = Array.isArray(issues) && issues.length
      ? issues.map((i: { title?: string }) => i.title).filter(Boolean).join(', ')
      : typeof issues === 'string' ? issues : '';

    const topToday = topItems(todayData?.items, 5).map(i => `${i.name} ${i.amount.toLocaleString()}원`).join(', ');

    let partialCompare = '';
    if (inProgress && todayData?.items?.length) {
      const todayPartial = slotsUpToHour(todayData.items, todayData.posBreakdown, kstHour);
      const yPartial = slotsUpToHour(compareData?.yesterday?.items, compareData?.yesterday?.posBreakdown, kstHour);
      partialCompare = `동시간대(${kstHour}시 KST까지) 순매출: 금일 ${todayPartial.total.toLocaleString()}원 vs 전일 ${yPartial.total.toLocaleString()}원`;
    }

    let monthAvg = '';
    if (recentSnap && !recentSnap.empty) {
      const nets: number[] = [];
      recentSnap.docs.forEach(d => {
        const r = d.data();
        if (r.reportDate <= date) nets.push(netFromDoc(r));
      });
      if (nets.length) {
        const avg = Math.round(nets.reduce((a, b) => a + b, 0) / nets.length);
        monthAvg = `당월 ${nets.length}일 평균 순매출 ${avg.toLocaleString()}원`;
      }
    }

    const compareLines = [
      fmtSnap('전일', dates.yesterday, compareData?.yesterday),
      fmtSnap('전월동일', dates.lastMonthSame, compareData?.lastMonthSame),
      fmtSnap('전월동요일', dates.lastMonthDow, compareData?.lastMonthDow),
      fmtSnap('전주동요일', dates.lastWeekDow, compareData?.lastWeekDow),
      fmtSnap('전년동월동일', dates.lastYearMonthSame, compareData?.lastYearMonthSame),
      fmtSnap('전년동월동요일', dates.lastYearMonthDow, compareData?.lastYearMonthDow),
    ].join('\n');

    const newsLines = naverNews.length
      ? naverNews.map(n => `[${n.keyword}] ${n.title}`).join('\n')
      : '최신 뉴스 없음';

    const trendLines = external.naverTrend?.trends?.length
      ? external.naverTrend.trends.slice(0, 4).map((t: { groupName: string; current: number; change: number }) =>
        `${t.groupName}: 검색지수 ${t.current} (${t.change > 0 ? '+' : ''}${t.change}%)`).join('\n')
      : '';

    const meatLines = [
      external.meatPrice?.items?.slice(0, 3).map((p: { name?: string; price?: number }) => `${p.name} ${p.price?.toLocaleString()}원`).join(', '),
      external.meatAuction?.items?.slice(0, 2).map((a: { item?: string; price?: number }) => `${a.item} ${a.price?.toLocaleString()}원`).join(', '),
    ].filter(Boolean).join(' | ');

    const timeContext = inProgress
      ? `현재 영업 중(${kstHour}시 KST). 마감 전이므로 전일·전주 전체 일매출과 단순 비교해 "부진"이라고 단정하지 말 것. 동시간대·시간대별 추이 위주로 평가.`
      : isToday
        ? `오늘 마감 완료. 하루 전체 실적 기준으로 평가.`
        : date < kstToday
          ? `과거 일자(${date}) 마감 완료 데이터. "오늘"이라고 표현하지 말 것.`
          : `미래 일자 — 예측·준비 관점.`;

    const rangeBlock = rangeContext?.start && rangeContext?.end
      ? `\n[기간 분석 ${rangeContext.start}~${rangeContext.end}] 총순매출 ${Number(rangeContext.totalNet || 0).toLocaleString()}원, ${rangeContext.days}일, 일평균 ${Number(rangeContext.avgNet || 0).toLocaleString()}원`
      : '';

    const prompt = `너는 정육점 매출·운영 분석 AI야. Pitaya OS 일마감 데이터와 외부 시장 정보를 종합해 **350자 이내** 한국어 운영 의견을 작성해.

[중요 규칙]
- ${timeContext}
- 숫자 나열보다 원인·패턴·대응(발주/프로모션/품목) 중심
- 날씨·뉴스·시세·검색트렌드가 매출과 연관되면 언급
- 비교 시 반드시 날짜를 함께 표기 (예: 전일 05-28 대비)
- 영업 중이면 아침/점심 저매출을 하루 부진으로 해석하지 말 것

[기준일 ${date}]
상태: ${inProgress ? '영업중(미마감)' : isClosed === false ? '데이터만(마감미확인)' : '마감'}
순매출: ${(todayData?.netSales ?? 0).toLocaleString()}원 | 총매출: ${(todayData?.totalSales ?? 0).toLocaleString()}원 | 객수: ${todayData?.customerCount ?? 0}명
${partialCompare ? partialCompare + '\n' : ''}${topToday ? `TOP품목: ${topToday}\n` : ''}${weatherText ? `날씨: ${weatherText}\n` : ''}${issueText ? `이슈: ${issueText}\n` : ''}${storedNews ? storedNews + '\n' : ''}${monthAvg ? monthAvg + '\n' : ''}${rangeBlock}

[비교 실적]
${compareLines}

[네이버 뉴스]
${newsLines}

[검색 트렌드]
${trendLines || '없음'}

[축산 시세/경매]
${meatLines || '없음'}

본문만 출력.`;

    const { text } = await generateTextWithFallback({ prompt });
    const review = text.trim().slice(0, 400);

    return NextResponse.json({ review, meta: { inProgress, kstHour, compareDates: dates } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sales-review]', e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
