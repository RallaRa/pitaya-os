import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD } from '@/lib/dateUtils';

function midnightMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId  = searchParams.get('storeId') || '';
  const forceGen = searchParams.get('force') === '1';
  const today    = getKSTTodayYMD();
  const cacheId  = `ai_insight_${storeId || 'global'}_${today}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);

  // 캐시 확인
  if (!forceGen) {
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const d = cacheDoc.data()!;
        if (Date.now() < midnightMs()) {
          return NextResponse.json({ ...d.result, cached: true, cachedAt: d.cachedAt?.toDate?.()?.toISOString() });
        }
      }
    } catch { /* ignore */ }
  }

  // 외부 데이터 수집 (auth 토큰 전달)
  const base    = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:9000';
  const authHdr = req.headers.get('Authorization') || '';
  let summaryData: any = {};
  try {
    const res = await fetch(`${base}/api/external/summary${storeId ? `?storeId=${storeId}` : ''}`, {
      headers: { Authorization: authHdr },
      signal: AbortSignal.timeout(20000),
    });
    summaryData = await res.json();
  } catch { /* proceed with empty data */ }

  const { meatPrices, meatAuction, naverTrends, salesItems } = summaryData;

  // 데이터 없을 때 fallback
  const hasSales  = salesItems  && salesItems.length  > 0;
  const hasPrice  = meatPrices  && meatPrices.prices?.length > 0;
  const hasAuction= meatAuction && meatAuction.auction;
  const hasTrend  = naverTrends && naverTrends.trends?.length > 0;

  if (!hasSales && !hasPrice && !hasAuction && !hasTrend) {
    const fallback = {
      todayBest: [],
      mainIssues: [],
      improvements: [{ category: '데이터', suggestion: '일마감 입력 후 AI 분석이 가능합니다.' }],
      tomorrowPrep: [],
      summary: '분석할 데이터가 없습니다. 일마감 데이터를 입력해주세요.',
      noData: true,
    };
    return NextResponse.json({ ...fallback, cached: false });
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({
      todayBest: [],
      mainIssues: [],
      improvements: [{ category: '설정', suggestion: 'GEMINI_API_KEY 설정 시 AI 인사이트를 이용할 수 있습니다.' }],
      tomorrowPrep: [],
      summary: 'AI 키 미설정 상태입니다.',
      noData: true,
      cached: false,
    });
  }

  // Gemini 분석
  const salesText  = hasSales  ? salesItems.slice(0, 15).map((i: any) => `${i.name}: ${i.qty}개 / ${i.amount.toLocaleString()}원`).join('\n') : '데이터 없음';
  const priceText  = hasPrice  ? meatPrices.prices.map((p: any) => `${p.itemName}: ${p.price.toLocaleString()}원/${p.unit}`).join('\n') : '데이터 없음';
  const auctionText= hasAuction ? `평균 ${meatAuction.auction.avgPrice.toLocaleString()}원, 최고 ${meatAuction.auction.maxPrice.toLocaleString()}원, 최저 ${meatAuction.auction.minPrice.toLocaleString()}원 (${meatAuction.auction.count}두)` : '데이터 없음';
  const trendText  = hasTrend  ? naverTrends.trends.map((t: any) => `${t.groupName}: 검색지수 ${t.current}, 전일대비 ${t.change > 0 ? '+' : ''}${t.change}%`).join('\n') : '데이터 없음';

  const prompt = `너는 정육점 매출 분석 전문가야.
아래 데이터를 종합 분석해서 JSON으로만 응답해줘.
다른 텍스트 없이 순수 JSON만 반환.

[우리 매장 최근 30일 매출]
${salesText}

[오늘 시장 소비자가격]
${priceText}

[오늘 도매 경매가]
${auctionText}

[최근 7일 소비자 검색트렌드]
${trendText}

응답 형식:
{
  "todayBest": [
    { "item": "품목명", "reason": "추천이유", "action": "구체적행동지침" }
  ],
  "mainIssues": [
    { "type": "가격변동|트렌드|재고|날씨", "title": "이슈제목", "detail": "상세내용" }
  ],
  "improvements": [
    { "category": "진열|가격|상품구성|마케팅", "suggestion": "보완제안" }
  ],
  "tomorrowPrep": [
    { "item": "준비항목", "priority": "high|medium|low", "detail": "상세내용" }
  ],
  "summary": "오늘 한줄 인사이트"
}

todayBest 최대 3개, mainIssues 최대 4개, improvements 최대 4개, tomorrowPrep 최대 5개.`;

  let result: any;
  try {
    const genAI  = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
    const model  = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res    = await model.generateContent(prompt);
    const text   = res.response.text().trim().replace(/```json|```/g, '').trim();
    result = JSON.parse(text);
  } catch (e: any) {
    // Gemini 실패 시 이전 캐시 반환
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const d = cacheDoc.data()!;
        return NextResponse.json({ ...d.result, cached: true, stale: true, error: e.message });
      }
    } catch { /* ignore */ }
    return NextResponse.json({ error: e.message, todayBest: [], mainIssues: [], improvements: [], tomorrowPrep: [], summary: 'AI 분석 실패', cached: false }, { status: 500 });
  }

  // 캐시 저장
  try {
    await cacheRef.set({ result, cachedAt: FieldValue.serverTimestamp() });
  } catch { /* ignore */ }

  return NextResponse.json({ ...result, cached: false });
}
