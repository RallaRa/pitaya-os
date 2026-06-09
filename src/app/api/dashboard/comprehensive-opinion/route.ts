import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isCronAuthorized } from '@/lib/cronAuth';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import { getKSTTodayYMD, getKSTYesterdayYMD, getKSTEndOfTodayMs } from '@/lib/dateUtils';
import { getDisplayNetSales } from '@/lib/posDailySales';
import { loadSystemContext } from '@/lib/aiStoreContext';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';
import {
  estimateFootTrafficWithComparisons,
  fetchCommercialArea,
  fetchNaverNewsHeadlines,
} from '@/lib/areaContext';
import {
  fetchRecentLivestockDisease,
  summarizeLivestockDiseaseForAi,
  type LivestockDiseaseRow,
} from '@/lib/mafra/fetchLivestockDisease';
import { sourceStatus, stripUndefinedDeep } from '@/lib/firestoreSanitize';
import {
  buildBriefingEvidenceLines,
  normalizeBriefingActions,
} from '@/lib/salesEvidence';
import { formatStaffingLine, STORE_BUSINESS_ANALYSIS_RULES } from '@/lib/storeBusinessContext';

export const maxDuration = 60;

function isBriefingCacheUsable(result: Record<string, unknown>): boolean {
  if (result.noData || result.aiError) return false;
  const summary = typeof result.summary === 'string' ? result.summary.trim() : '';
  const opinion = typeof result.opinion === 'string' ? result.opinion.trim() : '';
  const actions = Array.isArray(result.actions) ? result.actions.length : 0;
  const highlights = Array.isArray(result.highlights) ? result.highlights.length : 0;
  const trends = Array.isArray(result.trends) ? result.trends.length : 0;
  return !!(summary || opinion || actions || highlights || trends);
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  const cronOk = isCronAuthorized(req);
  if (!authUser && !cronOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const forceGen = searchParams.get('force') === '1';
  const today = getKSTTodayYMD();
  const cacheId = `market_briefing_${storeId || 'global'}_${today}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);

  if (!forceGen) {
    try {
      const cacheDoc = await cacheRef.get();
      if (cacheDoc.exists) {
        const d = cacheDoc.data()!;
        const result = d.result || {};
        if (Date.now() < getKSTEndOfTodayMs() && isBriefingCacheUsable(result)) {
          return NextResponse.json({ ...result, cached: true });
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

  const regionKeyword = regionSigungu || regionSido;

  const [storeContext, trendResult, commercial, news, livestockDisease] = await Promise.all([
    storeId ? loadSystemContext(storeId).catch(() => null) : Promise.resolve(null),
    fetchNaverTrendData(storeId),
    fetchCommercialArea(regionSido, regionSigungu),
    fetchNaverNewsHeadlines(6),
    fetchRecentLivestockDisease({ limit: 15, daysBack: 180, regionKeyword })
      .catch(() => ({ rows: [] as LivestockDiseaseRow[], totalCount: 0, fetchedAt: '', source: 'mafra' as const })),
  ]);

  const footTraffic = estimateFootTrafficWithComparisons(regionSido, regionSigungu);

  const todaySale = getDisplayNetSales(storeContext?.todaySales ?? null);
  const yesterdaySale = getDisplayNetSales(storeContext?.yesterdaySales ?? null);
  const saleChange = yesterdaySale > 0
    ? Math.round(((todaySale - yesterdaySale) / yesterdaySale) * 100)
    : null;

  const regionLabel = `${regionSigungu || regionSido}`.trim();
  const { lines: evidenceLines, salesBasis } = buildBriefingEvidenceLines({
    today,
    regionLabel,
    footTraffic,
    commercial,
    sales: { today: todaySale, yesterday: yesterdaySale, change: saleChange },
    trends: trendResult.trends,
    trendKeywords: trendResult.marketKeywords,
    newsCount: news.length,
    livestockCount: livestockDisease.rows.length,
    regionKeyword,
    isClosed: storeContext?.todaySales?.isClosed,
  });

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

  const newsText = news.length > 0
    ? news.map(n => `[${n.keyword}] ${n.title}`).join('\n')
    : '뉴스 없음';

  const diseaseText = livestockDisease.rows.length > 0
    ? summarizeLivestockDiseaseForAi(livestockDisease.rows)
    : '최근 180일 내 해당 지역 가축질병 발생 정보 없음';

  const dataSourceStatus: Record<string, { status: string; detail?: string }> = {
    유동인구: sourceStatus(footTraffic.source === 'api' ? 'ok' : 'estimate', `지수 ${footTraffic.index}`),
    상권: sourceStatus(commercial.source === 'api' ? 'ok' : 'estimate', commercial.competitiveLevel),
    네이버트렌드: sourceStatus(
      trendResult.trends.length > 0 ? 'ok' : 'empty',
      trendResult.error || (trendResult.trends.length > 0 ? `${trendResult.trends.length}그룹` : '키워드 미설정'),
    ),
    매출: sourceStatus(
      todaySale > 0 || yesterdaySale > 0 ? 'ok' : 'empty',
      todaySale > 0 ? `${todaySale.toLocaleString()}원` : yesterdaySale > 0 ? `${yesterdaySale.toLocaleString()}원(어제)` : undefined,
    ),
    고객: sourceStatus((storeContext?.topCustomers?.length || 0) > 0 ? 'ok' : 'empty'),
    뉴스: sourceStatus(news.length > 0 ? 'ok' : 'empty', news.length > 0 ? `${news.length}건` : undefined),
    가축질병: sourceStatus(
      livestockDisease.rows.length > 0 ? 'ok' : 'empty',
      livestockDisease.rows.length > 0 ? `${livestockDisease.rows.length}건(180일)` : undefined,
    ),
  };

  const hasSalesSignal = todaySale > 0 || yesterdaySale > 0;
  const hasAnyData =
    hasSalesSignal
    || Object.values(dataSourceStatus).some(s => s.status === 'ok' || s.status === 'estimate');

  if (!hasAnyData) {
    const missing = Object.entries(dataSourceStatus)
      .filter(([, s]) => s.status === 'empty')
      .map(([k]) => k);
    return NextResponse.json({
      summary: '브리핑할 데이터가 없습니다. 매장 지역·네이버 키워드·매출 연동을 확인해주세요.',
      opinion: '',
      highlights: [],
      trends: [],
      news: [],
      dataSourceStatus,
      noData: true,
      emptyReason: `브리핑 소스가 없습니다. 미수집: ${missing.join(', ') || '전체'}. 매장 지역·키워드·POS(매출 분위기)를 확인하세요.`,
      cached: false,
    });
  }

  if (!hasAnyAiProvider()) {
    const noAiMsg = 'AI API 키(Gemini/Anthropic/GROQ 등)가 서버에 설정되지 않았습니다. Vercel 환경변수를 확인하세요.';
    return NextResponse.json({
      summary: noAiMsg,
      opinion: noAiMsg,
      highlights: [],
      actions: [],
      trends: trendResult.trends,
      news,
      footTraffic,
      commercial,
      sales: { today: todaySale, yesterday: yesterdaySale, change: saleChange },
      evidenceLines,
      salesBasis,
      dataSourceStatus,
      aiError: true,
      error: noAiMsg,
      cached: false,
    });
  }

  const prompt = `너는 정육점 ${storeData.storeName || '매장'} **매출 향상 코치**야.
유동·상권·트렌드·뉴스·매출·가축질병을 보고 **오늘 매출을 올릴 실행**만 JSON으로 반환해.

【운영 전제】
- ${formatStaffingLine()}
${STORE_BUSINESS_ANALYSIS_RULES}

원칙:
- actions는 진열·가격·홍보·시간대 프로모션 등 **매출 직결** 행동만 (재고·발주·월간계획 금지)
- 유인(11–21시): 상담·진열·대면 프로모션 / 무인(21–11시): POP·키오스크·셀프 동선·알림 (직원 배치·대면 상담 조치 금지)
- 각 action에 basis: "무엇 vs 무엇" 근거 40자 이내 (예: "유동 전주同시 +8%·점심피크")
- highlights도 매출 연결 관점, text에 수치·비교 포함

[유동인구] ${footTraffic.summary}
[상권] ${commercial.businessSummary} (경쟁 ${commercial.competitiveLevel})
[오늘 매출] ${todaySale > 0 ? todaySale.toLocaleString() + '원' : '없음'}${saleChange != null ? ` (어제 대비 ${saleChange > 0 ? '+' : ''}${saleChange}%)` : ''}
[어제 매출] ${yesterdaySale > 0 ? yesterdaySale.toLocaleString() + '원' : '없음'}
[영업상태] ${storeContext?.todaySales?.isClosed ? '마감완료' : '영업중'}
[단골 참고] ${customerText}
[네이버 검색 트렌드]
${trendText}
[관련 뉴스]
${newsText}
[가축질병 발생(MAFRA, ${regionKeyword || '전국'})]
${diseaseText}

JSON 형식:
{
  "summary": "한줄 핵심 (40자, 매출·상권 중심)",
  "opinion": "150자 이내. **볼드** 사용. 근거·비교 수치 포함",
  "highlights": [
    {"tag":"상권|트렌드|뉴스|매출|고객|가축질병","text":"핵심(비교·수치 포함)"}
  ],
  "actions": [
    {"text":"오늘 매출 향상 행동","basis":"근거 40자: A vs B"}
  ]
}
highlights 4~6개, actions 3개(구체·즉시 실행·basis 필수)`;

  try {
    const aiResult = await generateTextWithFallback({ prompt, json: true, useCase: 'insight' });
    const parsed = JSON.parse(stripJsonMarkdown(aiResult.text)) as Record<string, unknown>;
    const actions = normalizeBriefingActions(parsed.actions);
    const result = {
      summary: String(parsed.summary ?? '').trim(),
      opinion: String(parsed.opinion ?? '').trim(),
      highlights: Array.isArray(parsed.highlights)
        ? (parsed.highlights as { tag?: string; text?: string }[])
            .filter(h => h && typeof h === 'object')
            .map(h => ({ tag: String(h.tag ?? ''), text: String(h.text ?? '') }))
            .filter(h => h.text)
        : [],
      actions,
    };

    const payload = {
      ...result,
      ...aiMetaJson(aiResult),
      trends: trendResult.trends,
      news,
      livestockDisease: livestockDisease.rows.slice(0, 8),
      footTraffic,
      commercial,
      sales: { today: todaySale, yesterday: yesterdaySale, change: saleChange },
      evidenceLines,
      salesBasis,
      dataSourceStatus,
      generatedAt: new Date().toISOString(),
      cached: false,
    };

    const cacheable =
      result.summary
      || result.opinion
      || result.highlights.length > 0
      || result.actions.length > 0;
    if (cacheable) {
      await cacheRef.set({ result: payload, cachedAt: FieldValue.serverTimestamp() }).catch(() => {});
    }
    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[briefing] AI pipeline:', msg);
    return NextResponse.json(stripUndefinedDeep({
      error: msg,
      aiError: true,
      summary: 'AI 분석 실패 — 새로고침을 눌러 다시 시도해 주세요.',
      opinion: '',
      highlights: [],
      actions: [],
      trends: trendResult.trends,
      news,
      livestockDisease: livestockDisease.rows.slice(0, 8),
      footTraffic,
      commercial,
      sales: { today: todaySale, yesterday: yesterdaySale, change: saleChange },
      evidenceLines,
      salesBasis,
      dataSourceStatus,
      cached: false,
    }));
  }
}
