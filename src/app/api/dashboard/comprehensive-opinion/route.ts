import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import { getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import { getDisplayTotalSale, posDailySalesDocId } from '@/lib/posDailySales';
import { loadSystemContext } from '@/lib/aiStoreContext';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';
import {
  estimateFootTraffic,
  fetchCommercialArea,
  fetchNaverNewsHeadlines,
} from '@/lib/areaContext';

function midnightMs() {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d.getTime();
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const forceGen = searchParams.get('force') === '1';
  const today = getKSTTodayYMD();
  const cacheId = `comprehensive_${storeId || 'global'}_${today}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);

  if (!forceGen) {
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const d = cacheDoc.data()!;
        if (Date.now() < midnightMs()) {
          return NextResponse.json({ ...d.result, cached: true });
        }
      }
    } catch { /* ignore */ }
  }

  let storeData: { regionSido?: string; regionSigungu?: string; storeName?: string } = {};
  if (storeId) {
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      if (snap.exists) storeData = snap.data() as typeof storeData;
    } catch { /* ignore */ }
  }

  const regionSido = storeData.regionSido || '서울';
  const regionSigungu = storeData.regionSigungu || '';

  const [storeContext, trendResult, commercial, news, itemSnap] = await Promise.all([
    storeId ? loadSystemContext(storeId).catch(() => null) : Promise.resolve(null),
    fetchNaverTrendData(storeId),
    fetchCommercialArea(regionSido, regionSigungu),
    fetchNaverNewsHeadlines(6),
    storeId
      ? adminDb.collection('pos_sales_detail')
        .where('storeId', '==', storeId)
        .orderBy('date', 'desc')
        .limit(500)
        .get()
        .catch(() => null)
      : Promise.resolve(null),
  ]);

  const footTraffic = estimateFootTraffic(regionSido, regionSigungu);

  const itemMap: Record<string, { qty: number; amount: number }> = {};
  itemSnap?.docs.forEach(d => {
    const r = d.data();
    const name = r.goodsName || '';
    if (!name) return;
    if (!itemMap[name]) itemMap[name] = { qty: 0, amount: 0 };
    itemMap[name].qty += Number(r.saleCount || 0);
    itemMap[name].amount += Number(r.totalPrice || 0);
  });
  const topItems = Object.entries(itemMap)
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 10);

  const todaySale = getDisplayTotalSale(storeContext?.todaySales ?? null);
  const yesterdaySale = getDisplayTotalSale(storeContext?.yesterdaySales ?? null);
  const saleChange = yesterdaySale > 0
    ? Math.round(((todaySale - yesterdaySale) / yesterdaySale) * 100)
    : null;

  const trendText = trendResult.marketKeywords?.length
    ? `시장 참조 키워드: ${trendResult.marketKeywords.join(', ')}\n${trendResult.operationHint || ''}\n` +
      (trendResult.trends.length > 0
        ? trendResult.trends.map(t => `${t.groupName}: 지수${t.current} (${t.change > 0 ? '+' : ''}${t.change}%)`).join('\n')
        : (trendResult.error || ''))
    : trendResult.trends.length > 0
      ? trendResult.trends.map(t => `${t.groupName}: 지수${t.current} (${t.change > 0 ? '+' : ''}${t.change}%)`).join('\n')
      : (trendResult.error || '키워드 미설정');

  const customerText = storeContext?.topCustomers?.slice(0, 5).map((c, i) =>
    `${i + 1}. ${c.name} 포인트${c.point} 방문${c.visitCount}회`,
  ).join('\n') || '고객 데이터 없음';

  const itemText = topItems.length > 0
    ? topItems.map(i => `${i.name}: ${i.qty}개/${i.amount.toLocaleString()}원`).join('\n')
    : '품목 판매 데이터 없음';

  const newsText = news.length > 0
    ? news.map(n => `[${n.keyword}] ${n.title}`).join('\n')
    : '뉴스 없음';

  const dataSourceStatus: Record<string, { status: string; detail?: string }> = {
    유동인구: { status: footTraffic.source === 'api' ? 'ok' : 'estimate', detail: `지수 ${footTraffic.index}` },
    상권: { status: commercial.source === 'api' ? 'ok' : 'estimate', detail: commercial.competitiveLevel },
    네이버트렌드: { status: trendResult.trends.length > 0 ? 'ok' : 'empty', detail: trendResult.error },
    매출: { status: todaySale > 0 || yesterdaySale > 0 ? 'ok' : 'empty', detail: todaySale > 0 ? `${todaySale.toLocaleString()}원` : undefined },
    고객: { status: (storeContext?.topCustomers?.length || 0) > 0 ? 'ok' : 'empty' },
    품목판매: { status: topItems.length > 0 ? 'ok' : 'empty', detail: `${topItems.length}품목` },
    뉴스: { status: news.length > 0 ? 'ok' : 'empty', detail: `${news.length}건` },
  };

  const hasAnyData = Object.values(dataSourceStatus).some(s => s.status === 'ok' || s.status === 'estimate');

  if (!hasAnyData) {
    const missing = Object.entries(dataSourceStatus)
      .filter(([, s]) => s.status === 'empty')
      .map(([k]) => k);
    return NextResponse.json({
      summary: '분석할 데이터가 없습니다. POS 연동·일마감·키워드 설정 후 다시 확인해주세요.',
      opinion: '',
      highlights: [],
      trends: [],
      news: [],
      dataSourceStatus,
      noData: true,
      emptyReason: `연동된 데이터 소스가 없습니다. 미수집: ${missing.join(', ') || '전체'}. POS 브릿지·일마감·네이버 키워드를 확인하세요.`,
      cached: false,
    });
  }

  if (!hasAnyAiProvider()) {
    return NextResponse.json({
      summary: 'AI API 키 미설정',
      opinion: '',
      highlights: [],
      trends: trendResult.trends,
      news,
      dataSourceStatus,
      noData: true,
      emptyReason: 'AI API 키(Gemini/OpenAI 등)가 설정되지 않아 종합 의견을 생성할 수 없습니다. .env.local을 확인하세요.',
      cached: false,
    });
  }

  const prompt = `너는 정육점 ${storeData.storeName || '매장'} AI 운영 컨설턴트야.
아래 유동·상권·매출·고객·품목·트렌드·뉴스를 종합해 **오늘 당장 실행할 운영 의견**을 JSON으로만 반환해.

[유동인구] ${footTraffic.summary}
[상권] ${commercial.businessSummary} (경쟁 ${commercial.competitiveLevel})
[오늘 매출] ${todaySale > 0 ? todaySale.toLocaleString() + '원' : '없음'}${saleChange != null ? ` (어제 대비 ${saleChange > 0 ? '+' : ''}${saleChange}%)` : ''}
[어제 매출] ${yesterdaySale > 0 ? yesterdaySale.toLocaleString() + '원' : '없음'}
[영업상태] ${storeContext?.todaySales?.isClosed ? '마감완료' : '영업중'}
[상위 고객]
${customerText}
[품목별 판매 TOP10]
${itemText}
[네이버 검색 트렌드]
${trendText}
[관련 뉴스]
${newsText}

JSON 형식:
{
  "summary": "한줄 핵심 (40자 이내)",
  "opinion": "300자 이내 종합 운영의견. **볼드** 사용. 유동·상권·매출·트렌드·뉴스를 모두 반영",
  "highlights": [
    {"tag":"매출|고객|품목|트렌드|상권|뉴스","text":"핵심 포인트"}
  ],
  "actions": ["오늘 할 일 1", "오늘 할 일 2", "오늘 할 일 3"]
}
highlights 4~6개, actions 3개`;

  try {
    const aiResult = await generateTextWithFallback({ prompt, json: true, useCase: 'insight' });
    const result: {
      summary: string;
      opinion: string;
      highlights: { tag: string; text: string }[];
      actions: string[];
    } = JSON.parse(stripJsonMarkdown(aiResult.text));

    const payload = {
      ...result,
      ...aiMetaJson(aiResult),
      trends: trendResult.trends,
      news,
      footTraffic,
      commercial,
      sales: { today: todaySale, yesterday: yesterdaySale, change: saleChange },
      dataSourceStatus,
      generatedAt: new Date().toISOString(),
      cached: false,
    };

    await cacheRef.set({ result: payload, cachedAt: FieldValue.serverTimestamp() }).catch(() => {});
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({
      error: msg,
      summary: 'AI 분석 실패',
      opinion: '',
      highlights: [],
      trends: trendResult.trends,
      news,
      dataSourceStatus,
      cached: false,
    }, { status: 500 });
  }
}
