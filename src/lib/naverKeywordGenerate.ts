import { adminDb } from '@/lib/firebase/admin';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';

/** 시장 참조 검색 키워드 목표 개수 */
export const MARKET_KEYWORD_TARGET = 30;
/** 네이버 DataLab API 동시 조회 그룹 한도 */
export const NAVER_TREND_GROUP_MAX = 5;
/** 그룹당 키워드 수 (30 ÷ 5) */
export const KEYWORDS_PER_TREND_GROUP = MARKET_KEYWORD_TARGET / NAVER_TREND_GROUP_MAX;

export interface GeneratedKeywordGroup {
  groupName: string;
  keywords: string[];
  analysisNote: string;
  priorityScore?: number;
}

export interface MarketKeywordResult {
  /** 운영방향 설정용 시장 참조 키워드 (항상 ~30개) */
  marketKeywords: string[];
  /** 네이버 트렌드 API용 그룹 (최대 5) */
  groups: GeneratedKeywordGroup[];
  /** AI가 제안하는 시장 기반 운영 방향 (1~2문장) */
  operationHint: string;
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
  } | null;
}

const DEFAULT_MARKET_KEYWORDS = [
  '한우', '한우등심', '한우가격', '소고기', '등심', '안심',
  '삼겹살', '목살', '돼지고기', '돼지갈비', '앞다리살', '뒷다리살',
  '닭고기', '닭다리', '오리고기', '양념육', '불고기', '갈비',
  '바비큐', '캠핑고기', '고기선물', '한우선물세트', '정육점', '고기배달',
  '에어프라이어 고기', '스테이크', 'LA갈비', '수입육', '축산물 가격', '고기요리',
];

const GROUP_THEMES = [
  { groupName: '프리미엄·한우', note: '한우·프리미엄 소비 수요·가격 이슈' },
  { groupName: '일상·돼지', note: '가격 민감 일상 소비 축' },
  { groupName: '계절·이벤트', note: '계절·명절·캠핑 등 수요 변동' },
  { groupName: '홈쿡·레시피', note: '구매 직전 조리·레시피 검색' },
  { groupName: '소비·시장트렌드', note: '선물·가격·업종 전반 검색' },
];

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

  if (m <= 2) events.push(`${y} 설·명절 선물`);
  if (m >= 4 && m <= 5) events.push('가정의달·바비큐 시즌');
  if (m >= 6 && m <= 8) events.push('여름 캠핑·야외구이·삼계탕');
  if (m >= 9 && m <= 10) events.push('추석·환절기 보양');
  if (m >= 11 || m <= 1) events.push('연말·설 대비 선물');

  events.push('한우·축산물 가격');
  events.push('홈쿡·단백질·건강식');
  events.push('수입육·대체재');

  return events;
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

  const start7 = new Date(today);
  start7.setDate(start7.getDate() - 7);
  const start14 = new Date(today);
  start14.setDate(start14.getDate() - 14);

  const [recent, prev] = await Promise.allSettled([
    fetchPeriodTotals(storeId, ymd(start7), todayStr, 'recent7d'),
    fetchPeriodTotals(storeId, ymd(start14), ymd(new Date(start7.getTime() - 86400000)), 'prev7d'),
  ]);

  let salesTrend: KeywordMarketContext['salesTrend'] = null;
  const recentVal = recent.status === 'fulfilled' ? recent.value : null;
  const prevVal = prev.status === 'fulfilled' ? prev.value : null;
  if (recentVal && prevVal && (recentVal.net > 0 || prevVal.net > 0)) {
    salesTrend = {
      recent7dNet: recentVal.net,
      prev7dNet: prevVal.net,
      changePct: prevVal.net > 0 ? Math.round(((recentVal.net - prevVal.net) / prevVal.net) * 100) : 0,
    };
  }

  return {
    storeName,
    today: todayStr,
    season: getSeason(today),
    upcomingEvents: getUpcomingEvents(today),
    salesTrend,
  };
}

export function ensureMarketKeywordCount(keywords: string[]): string[] {
  const unique = [...new Set(keywords.map(k => k.trim()).filter(Boolean))];
  if (unique.length >= MARKET_KEYWORD_TARGET) return unique.slice(0, MARKET_KEYWORD_TARGET);
  for (const k of DEFAULT_MARKET_KEYWORDS) {
    if (unique.length >= MARKET_KEYWORD_TARGET) break;
    if (!unique.includes(k)) unique.push(k);
  }
  return unique.slice(0, MARKET_KEYWORD_TARGET);
}

/** 30개 키워드 → 네이버 API용 5그룹×6키워드 */
export function buildTrendGroupsFromKeywords(
  marketKeywords: string[],
  notes?: Partial<Record<string, string>>,
): GeneratedKeywordGroup[] {
  const kw = ensureMarketKeywordCount(marketKeywords);
  const perGroup = KEYWORDS_PER_TREND_GROUP;
  return GROUP_THEMES.map((theme, i) => ({
    groupName: theme.groupName,
    keywords: kw.slice(i * perGroup, i * perGroup + perGroup),
    analysisNote: notes?.[theme.groupName] || theme.note,
    priorityScore: 100 - i * 5,
  })).filter(g => g.keywords.length > 0);
}

function parseGeminiJson(text: string): unknown {
  const cleaned = text.trim().replace(/```json|```/g, '').trim();
  return JSON.parse(cleaned);
}

function parseAiResult(raw: unknown): Partial<MarketKeywordResult> | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;

  let marketKeywords: string[] = [];
  if (Array.isArray(o.marketKeywords)) {
    marketKeywords = o.marketKeywords.map(k => String(k).trim()).filter(Boolean);
  }

  let groups: GeneratedKeywordGroup[] = [];
  if (Array.isArray(o.groups)) {
    groups = o.groups.map(normalizeGroup).filter(Boolean) as GeneratedKeywordGroup[];
  }

  if (marketKeywords.length === 0 && groups.length > 0) {
    marketKeywords = groups.flatMap(g => g.keywords);
  }

  const operationHint = String(o.operationHint || o.operationDirection || '').trim();

  if (marketKeywords.length === 0 && groups.length === 0) return null;
  return { marketKeywords, groups, operationHint };
}

function normalizeGroup(raw: unknown): GeneratedKeywordGroup | null {
  if (!raw || typeof raw !== 'object') return null;
  const g = raw as Record<string, unknown>;
  const groupName = String(g.groupName || '').trim();
  const keywords = Array.isArray(g.keywords)
    ? g.keywords.map(k => String(k).trim()).filter(Boolean)
    : [];
  const analysisNote = String(g.analysisNote || g.rationale || '').trim();
  if (!groupName || keywords.length === 0) return null;
  return {
    groupName,
    keywords,
    analysisNote: analysisNote || '시장 참조 변수',
    priorityScore: typeof g.priorityScore === 'number' ? g.priorityScore : undefined,
  };
}

function fallbackResult(ctx: KeywordMarketContext): MarketKeywordResult {
  const seasonal = ctx.season === '여름'
    ? ['캠핑고기', '바비큐']
    : ctx.season === '겨울'
      ? ['LA갈비', '전골']
      : ['삼겹살', '불고기'];

  const marketKeywords = ensureMarketKeywordCount([
    ...seasonal,
    '한우', '한우가격', '돼지고기', '고기선물', '정육점', '에어프라이어 고기', '목살',
  ]);

  return {
    marketKeywords,
    groups: buildTrendGroupsFromKeywords(marketKeywords),
    operationHint: `${ctx.season}철·${ctx.upcomingEvents[0] || '시장 이슈'}를 참고해 축종·프로모션·진열 우선순위를 조정하세요.`,
  };
}

function formatContextForPrompt(ctx: KeywordMarketContext): string {
  const lines = [
    `- 기준일: ${ctx.today} (${ctx.season}철)`,
    `- 시장 이슈: ${ctx.upcomingEvents.join(' / ')}`,
  ];
  if (ctx.salesTrend) {
    lines.push(`- 매장 매출(참고): 최근7일 ${ctx.salesTrend.recent7dNet.toLocaleString('ko-KR')}원 (전주 ${ctx.salesTrend.changePct >= 0 ? '+' : ''}${ctx.salesTrend.changePct}%)`);
  }
  return lines.join('\n');
}

/**
 * 시장 전반 참조 변수 ~30개 + 네이버 트렌드 5그룹 생성.
 * POS 품목과 무관, 운영방향 설정용.
 */
export async function generateMarketKeywords(
  ctx: KeywordMarketContext,
): Promise<MarketKeywordResult> {
  if (!hasAnyAiProvider()) return fallbackResult(ctx);

  const perGroup = KEYWORDS_PER_TREND_GROUP;

  const prompt = `당신은 정육·축산 시장 분석가입니다.

목표: 정육점 **운영방향 설정**에 쓸 **시장 참조 검색 키워드 30개**를 선정하세요.
이 키워드는 POS 품목명이 아니라, **전국 소비자 검색·시장 이슈**를 반영하는 참조 변수입니다.

컨텍스트:
${formatContextForPrompt(ctx)}

고려 요인: 계절·명절·가격·홈쿡·캠핑·선물·건강·수입육·레시피·축종별·조리법·배달·프리미엄·가격민감 등

규칙:
- marketKeywords: **정확히 30개** (중복·품목코드·무게표기 금지, 다양한 시장 축 포함)
- groups: 위 30개를 5개 테마로 나눔 (그룹당 ${perGroup}키워드, 네이버 API용)
- operationHint: 이 30개 키워드 기준 **운영방향 2~3문장** (진열·프로모·발주·마케팅 관점)
- POS 품목명 사용 금지

JSON만 반환:
{
  "marketKeywords": ["키워드1", "...30개"],
  "operationHint": "운영방향",
  "groups": [
    { "groupName": "테마", "keywords": ["키워드1"...${perGroup}개], "analysisNote": "근거" }
  ]
}`;

  try {
    const { text } = await generateTextWithFallback({ prompt, json: true, useCase: 'insight' });
    const parsed = parseAiResult(parseGeminiJson(stripJsonMarkdown(text)));
    if (!parsed) return fallbackResult(ctx);

    const marketKeywords = ensureMarketKeywordCount(parsed.marketKeywords || []);
    const noteMap = Object.fromEntries(
      (parsed.groups || []).map(g => [g.groupName, g.analysisNote]),
    );
    let groups = (parsed.groups?.length === NAVER_TREND_GROUP_MAX)
      ? parsed.groups!.map((g, i) => ({
        ...g,
        keywords: g.keywords.slice(0, perGroup),
        priorityScore: g.priorityScore ?? 100 - i * 5,
      }))
      : buildTrendGroupsFromKeywords(marketKeywords, noteMap);

    if (groups.length === 0) {
      groups = buildTrendGroupsFromKeywords(marketKeywords, noteMap);
    }

    return {
      marketKeywords,
      groups: groups.slice(0, NAVER_TREND_GROUP_MAX),
      operationHint: parsed.operationHint || fallbackResult(ctx).operationHint,
    };
  } catch {
    return fallbackResult(ctx);
  }
}

/** @deprecated generateMarketKeywords 사용 */
export async function generateSearchKeywordGroups(ctx: KeywordMarketContext) {
  const r = await generateMarketKeywords(ctx);
  return r.groups;
}
