import { GoogleGenerativeAI } from '@google/generative-ai';
import { adminDb } from '@/lib/firebase/admin';
import { fetchPeriodTotals, fetchTopSellingItems } from '@/lib/dashboardSalesData';

export interface GeneratedKeywordGroup {
  /** 네이버 트렌드 차트 표시용 테마명 */
  groupName: string;
  /** 네이버 검색 키워드 */
  keywords: string[];
  /** AI가 이 그룹을 선정한 통계·시장 근거 (1~2문장) */
  analysisNote: string;
  /** 관심도 점수 1~100 (높을수록 우선 모니터링) */
  priorityScore?: number;
}

export interface KeywordMarketContext {
  storeName: string;
  today: string;
  season: string;
  upcomingEvents: string[];
  salesTrend: {
    recent7dNet: number;
    prev7dNet: number;
    changePct: number;
    customers7d: number;
  } | null;
  categoryMix: { category: string; sharePct: number }[];
}

function ymd(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function getSeason(d: Date): string {
  const m = d.getMonth() + 1;
  if (m >= 3 && m <= 5) return '봄';
  if (m >= 6 && m <= 8) return '여름';
  if (m >= 9 && m <= 11) return '가을';
  return '겨울';
}

function getUpcomingEvents(d: Date): string[] {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  const events: string[] = [];

  if (m <= 2) events.push(`${y} 설 연휴·명절 선물 수요`);
  if (m >= 4 && m <= 5) events.push('가정의달·어린이날·스승의날 선물·바비큐 시즌 진입');
  if (m >= 6 && m <= 8) events.push('여름 캠핑·야외 바비큐·삼계탕·냉면 시즌');
  if (m >= 9 && m <= 10) events.push('추석 연휴·명절 선물·환절기 보양식');
  if (m >= 11 || m <= 1) events.push('연말연시 모임·송년회·선물세트·설 대비');

  events.push('한우·축산물 가격·수입육 이슈');
  events.push('건강·저염·다이어트·단백질 식단 트렌드');
  events.push('배달·홈쿡·에어프라이어 조리법 검색');

  return events;
}

const CATEGORY_RULES = [
  { category: '한우·소고기', re: /한우|소고기|등심|안심|갈비|불고기|사태|양지|우육|채끝/i },
  { category: '돼지고기', re: /돼지|삼겹|목살|앞다|뒷다|갈매|항정/i },
  { category: '닭·오리·조류', re: /닭|오리|치킨|조류|오리고/i },
  { category: '양념·가공·선물', re: /양념|선물|세트|햄|베이컨|소시|패티|마리/i },
];

function inferCategoryMix(items: { name: string; qty: number }[]) {
  const totals: Record<string, number> = {};
  let sum = 0;
  for (const item of items) {
    const cat = CATEGORY_RULES.find(r => r.re.test(item.name))?.category || '기타';
    totals[cat] = (totals[cat] || 0) + item.qty;
    sum += item.qty;
  }
  if (sum === 0) return [];
  return Object.entries(totals)
    .map(([category, qty]) => ({ category, sharePct: Math.round((qty / sum) * 100) }))
    .sort((a, b) => b.sharePct - a.sharePct);
}

export async function buildKeywordMarketContext(storeId: string): Promise<KeywordMarketContext> {
  const today = new Date();
  const todayStr = ymd(today);

  let storeName = '정육점';
  try {
    const storeSnap = await adminDb.collection('stores').doc(storeId).get();
    if (storeSnap.exists) {
      storeName = String(storeSnap.data()?.name || storeSnap.data()?.storeName || storeName);
    }
  } catch { /* ignore */ }

  const end = new Date(today);
  const start7 = new Date(today);
  start7.setDate(start7.getDate() - 7);
  const start14 = new Date(today);
  start14.setDate(start14.getDate() - 14);

  const [recent, prev, topItems] = await Promise.all([
    fetchPeriodTotals(storeId, ymd(start7), todayStr, 'recent7d'),
    fetchPeriodTotals(storeId, ymd(start14), ymd(new Date(start7.getTime() - 86400000)), 'prev7d'),
    fetchTopSellingItems(storeId, 30, 40),
  ]);

  let salesTrend: KeywordMarketContext['salesTrend'] = null;
  if (recent.net > 0 || prev.net > 0) {
    const changePct = prev.net > 0
      ? Math.round(((recent.net - prev.net) / prev.net) * 100)
      : 0;
    salesTrend = {
      recent7dNet: recent.net,
      prev7dNet: prev.net,
      changePct,
      customers7d: recent.customers,
    };
  }

  return {
    storeName,
    today: todayStr,
    season: getSeason(today),
    upcomingEvents: getUpcomingEvents(today),
    salesTrend,
    categoryMix: inferCategoryMix(topItems),
  };
}

function parseJsonArray(text: string): GeneratedKeywordGroup[] {
  const cleaned = text.trim().replace(/```json|```/g, '').trim();
  const parsed = JSON.parse(cleaned);
  if (!Array.isArray(parsed)) throw new Error('JSON 배열 아님');
  return parsed.map(normalizeGroup).filter(Boolean) as GeneratedKeywordGroup[];
}

function normalizeGroup(raw: unknown): GeneratedKeywordGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const groupName = String(g.groupName || '').trim();
  const keywords = Array.isArray(g.keywords)
    ? g.keywords.map(k => String(k).trim()).filter(Boolean)
    : [];
  const analysisNote = String(g.analysisNote || g.rationale || '').trim();
  const priorityScore = typeof g.priorityScore === 'number' ? g.priorityScore : undefined;
  if (!groupName || keywords.length === 0) return null;
  return {
    groupName,
    keywords,
    analysisNote: analysisNote || '시장 수요·검색 트렌드 모니터링 대상',
    priorityScore,
  };
}

function fallbackGroups(ctx: KeywordMarketContext): GeneratedKeywordGroup[] {
  const seasonal: GeneratedKeywordGroup[] = [];

  if (ctx.season === '여름') {
    seasonal.push({
      groupName: '여름 바비큐·캠핑',
      keywords: ['캠핑 고기', '바비큐 고기', '삼겹살', '목살'],
      analysisNote: `${ctx.season}철 야외·캠핑 수요 증가 구간`,
      priorityScore: 85,
    });
  } else if (ctx.season === '겨울') {
    seasonal.push({
      groupName: '겨울 찜·전골',
      keywords: ['LA갈비', '소곱창전골', '우거지국밥', '설렁탕'],
      analysisNote: `${ctx.season}철 보양·찜 요리 검색 상승 구간`,
      priorityScore: 85,
    });
  }

  const base: GeneratedKeywordGroup[] = [
    {
      groupName: '한우·프리미엄 소',
      keywords: ['한우', '한우등심', '한우선물', '소고기'],
      analysisNote: '한우 가격·프리미엄 수요는 정육점 핵심 검색 축',
      priorityScore: 90,
    },
    {
      groupName: '돼지고기 일상 수요',
      keywords: ['삼겹살', '목살', '돼지고기', '돼지갈비'],
      analysisNote: '가격 민감·일상 소비 비중이 큰 축종',
      priorityScore: 80,
    },
    {
      groupName: '홈쿡·레시피',
      keywords: ['고기 요리', '에어프라이어 고기', '불고기 레시피', '스테이크 굽는법'],
      analysisNote: '조리법·레시피 검색은 구매 직전 수요 신호',
      priorityScore: 75,
    },
    {
      groupName: '선물·명절',
      keywords: ['한우선물세트', '고기선물', '정육점 선물', '명절 선물'],
      analysisNote: '명절·기념일 선물 수요는 계절성 피크 발생',
      priorityScore: 70,
    },
  ];

  return [...seasonal, ...base].slice(0, 5);
}

function formatContextForPrompt(ctx: KeywordMarketContext): string {
  const lines: string[] = [
    `- 매장: ${ctx.storeName}`,
    `- 기준일: ${ctx.today} (${ctx.season}철)`,
    `- 주요 이슈·시즌 요인: ${ctx.upcomingEvents.join(' / ')}`,
  ];

  if (ctx.salesTrend) {
    const t = ctx.salesTrend;
    lines.push(
      `- 최근 7일 매출: ${t.recent7dNet.toLocaleString('ko-KR')}원 (전주 대비 ${t.changePct >= 0 ? '+' : ''}${t.changePct}%)`,
      `- 최근 7일 고객 수: ${t.customers7d.toLocaleString('ko-KR')}명`,
    );
  } else {
    lines.push('- 매출 통계: 데이터 없음 (일반 정육 시장 기준으로 분석)');
  }

  if (ctx.categoryMix.length) {
    lines.push(
      `- 축종·카테고리 판매 비중(참고, 품목명 아님): ${ctx.categoryMix.map(c => `${c.category} ${c.sharePct}%`).join(', ')}`,
    );
  }

  return lines.join('\n');
}

/**
 * POS 품목이 아닌, 시장·계절·이슈·매출 통계를 종합해
 * 네이버 검색 트렌드 모니터링용 키워드 그룹 생성 (최대 5)
 */
export async function generateSearchKeywordGroups(
  ctx: KeywordMarketContext,
): Promise<GeneratedKeywordGroup[]> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!apiKey) return fallbackGroups(ctx);

  const prompt = `당신은 정육·축산 유통 업계의 네이버 검색 트렌드 분석가입니다.

목표: 정육점 운영자가 **네이버 DataLab**으로 모니터링할 **검색 키워드 그룹**을 통계적으로 선정하세요.
이것은 POS 품목명 매핑이 아닙니다. 소비자 검색 수요, 계절성, 가격·이슈, 식습관 변화 등 **수많은 시장 요인**을 종합해 판단하세요.

입력 컨텍스트:
${formatContextForPrompt(ctx)}

분석 시 고려할 요인 (예시):
- 계절·명절·휴일 수요 (바비큐, 찜, 선물세트 등)
- 한우·돼지·닭 가격 이슈, 수입육·대체재 검색
- 건강·다이어트·단백질·홈쿡·배달 트렌드
- 레시피·조리법·에어프라이어 등 구매 직전 검색
- 지역·매장 규모보다 **전국 소비자 검색 행동** 기준

규칙:
- 최대 5개 그룹 (네이버 API 한도)
- groupName: 트렌드 차트용 짧은 테마명
- keywords: 실제 네이버 검색어 3~5개 (POS 품목명·상품코드·무게 표기 금지)
- analysisNote: 왜 지금 이 그룹을 모니터링해야 하는지 통계·시장 근거 1~2문장
- priorityScore: 1~100 (높을수록 우선)
- priorityScore 내림차순으로 정렬

JSON 배열만 반환:
[{ "groupName": "테마", "keywords": ["검색어1","검색어2"], "analysisNote": "근거", "priorityScore": 85 }]`;

  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const res = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: 'application/json' },
    });
    const groups = parseJsonArray(res.response.text());
    if (groups.length === 0) return fallbackGroups(ctx);
    return groups
      .sort((a, b) => (b.priorityScore ?? 0) - (a.priorityScore ?? 0))
      .slice(0, 5);
  } catch {
    return fallbackGroups(ctx);
  }
}
