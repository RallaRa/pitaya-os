import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';
import {
  formatSignageCustomerContextBlock,
  type SignageShowContext,
} from '@/lib/signage/signageShowShared';

export interface SignageSlidePlan {
  id: string;
  title: string;
  body: string;
  footer?: string;
  duration: number;
  topic: string;
  bgColor: string;
  textColor: string;
}

export interface SignageShowPlanResult {
  reply: string;
  slides: SignageSlidePlan[];
  totalDuration: number;
}

const SLIDE_PALETTE = [
  { bg: '#1a1a2e', fg: '#ffffff' },
  { bg: '#16213e', fg: '#e8f4ff' },
  { bg: '#1b4332', fg: '#d8f3dc' },
  { bg: '#4a1942', fg: '#ffeef8' },
  { bg: '#3d0000', fg: '#ffd6d6' },
];

const TOPIC_LABELS: Record<string, string> = {
  welcome: '환영',
  hot_item: '인기 품목',
  pick_item: '오늘의 Pick',
  popular_item: '인기 품목',
  promotion: '프로모션',
  weather: '날씨·계절',
  hygiene: '신선·위생',
  event: '이벤트',
  brand: '매장 소개',
};

/** 고객 화면에 노출하면 안 되는 표현 */
const CUSTOMER_FORBIDDEN = /매출|순매출|마감|집계|운영\s*이슈|무인\s*매장|유인\s*매장|어제\s*대비|전일\s*대비|%\s*하락|%\s*상승|재고\s*부족|안\s*팔|저조|침체|실적/i;

export function topicLabel(topic: string): string {
  return TOPIC_LABELS[topic] || topic;
}

function newSlideId(): string {
  return `slide-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

export function normalizeSlidePlan(raw: unknown, index: number): SignageSlidePlan | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const title = String(o.title || '').trim();
  const body = String(o.body || '').trim();
  if (!title || !body) return null;

  const palette = SLIDE_PALETTE[index % SLIDE_PALETTE.length];
  let duration = Number(o.duration) || 6;
  duration = Math.min(10, Math.max(4, Math.round(duration)));

  return {
    id: String(o.id || newSlideId()),
    title: title.slice(0, 40),
    body: body.slice(0, 120),
    footer: o.footer ? String(o.footer).slice(0, 40) : undefined,
    duration,
    topic: String(o.topic || 'brand').slice(0, 32),
    bgColor: String(o.bgColor || palette.bg),
    textColor: String(o.textColor || palette.fg),
  };
}

export function balanceSlideDurations(slides: SignageSlidePlan[]): SignageSlidePlan[] {
  const count = slides.length;
  if (count === 0) return slides;

  const targetTotal = count <= 4 ? 24 : 28;
  const base = Math.floor(targetTotal / count);
  let remainder = targetTotal - base * count;

  return slides.map(s => {
    const extra = remainder > 0 ? 1 : 0;
    if (remainder > 0) remainder -= 1;
    return { ...s, duration: Math.min(8, Math.max(5, base + extra)) };
  });
}

export function sanitizeSlidesForCustomer(slides: SignageSlidePlan[]): SignageSlidePlan[] {
  return slides.filter(slide => {
    const text = `${slide.title} ${slide.body} ${slide.footer || ''}`;
    return !CUSTOMER_FORBIDDEN.test(text);
  });
}

export function parseShowPlanFromAi(content: string): { reply: string; slides: SignageSlidePlan[] } {
  const cleaned = content.replace(/```json|```/g, '').trim();
  try {
    const parsed = JSON.parse(cleaned) as { reply?: string; slides?: unknown[] };
    const slides = sanitizeSlidesForCustomer(
      (parsed.slides || [])
        .map((s, i) => normalizeSlidePlan(s, i))
        .filter((s): s is SignageSlidePlan => !!s)
        .slice(0, 5),
    );
    return {
      reply: String(parsed.reply || '쇼 구성을 준비했습니다.'),
      slides: balanceSlideDurations(slides),
    };
  } catch {
    return { reply: content.slice(0, 200), slides: [] };
  }
}

export function buildSignageShowSystemPrompt(ctx: SignageShowContext): string {
  return appendStoreBusinessContext(`너는 정육점 TV 사이니지 **고객용** 콘텐츠 기획자야.
슬라이드는 매장 손님이 보는 화면이다. **내부 운영·매출 정보는 절대 노출 금지.**

【고객 화면 절대 금지】
- 매출·순매출·전일 대비·% 변동·마감·집계·운영 이슈·무인/유인 운영·재고 부족·"안 팔림"·저조·실적
- HR·사원·직원 언급

【콘텐츠 전략 — 로테이션】
- **hot_item**: 잘 나가는 품목 — "인기", "베스트", "손님들이 많이 찾는" 톤
- **pick_item**: 저회전 품목 — "오늘의 Pick", "Chef 추천", "이번 주 특별 추천", 맛·신선·레시피로 **구매 유도** (재고/매출 언급 없이)
- 4~5장, 총 20~30초 (장당 5~7초)
- topic: welcome | hot_item | pick_item | promotion | weather | hygiene | event | brand
- 식욕 자극, TV 3m 거리에서 읽히는 짧은 한국어

반드시 JSON만:
{"reply":"점주에게 할 설명(로테이션·품목 선택 이유, 내부 지표 언급 가능)","slides":[{"title":"","body":"","footer":"","duration":6,"topic":"hot_item","bgColor":"#1a1a2e","textColor":"#ffffff"}]}

=== 고객용 슬라이드 데이터 ===
${formatSignageCustomerContextBlock(ctx)}`);
}

export function buildSignageShowUserPrompt(
  message: string,
  existingSlides?: SignageSlidePlan[],
): string {
  if (!message.trim() && !existingSlides?.length) {
    return '이번 로테이션 인기 품목 1장 + 추천 유도(Pick) 1장 포함해서 4~5장 고객용 쇼 구성해줘. 매출·운영 정보는 슬라이드에 넣지 마.';
  }
  if (!message.trim()) {
    return '현재 로테이션 기준으로 인기·Pick 품목을 바꿔서 다시 구성해줘. 고객에게 보이는 문구만.';
  }
  let prompt = message.trim();
  if (existingSlides?.length) {
    prompt += `\n\n현재 슬라이드 구성:\n${existingSlides.map((s, i) =>
      `${i + 1}. [${s.topic}] ${s.title} — ${s.body}`,
    ).join('\n')}`;
  }
  return prompt;
}

export function buildFallbackShowPlan(ctx: SignageShowContext): SignageShowPlanResult {
  const hot = ctx.rotation.featuredHot || ctx.hotItems[0];
  const pick = ctx.rotation.featuredSlow || ctx.slowItems[0];
  const hot2 = ctx.rotation.alternateHot || ctx.hotItems[1];

  const pickBody = pick
    ? `${pick.name}\n오늘의 Pick · 신선하게 준비했어요`
    : '신선한 국내산 정육\n지금 매장에서 만나보세요';

  const slides: SignageSlidePlan[] = balanceSlideDurations([
    normalizeSlidePlan({
      title: ctx.storeName,
      body: '365일 무휴 · 24시간\n신선한 정육을 만나보세요',
      footer: '환영합니다',
      topic: 'welcome',
      duration: 6,
    }, 0)!,
    normalizeSlidePlan({
      title: hot ? `인기 ${hot.name}` : '베스트 셀러',
      body: hot
        ? `손님들이 많이 찾는 ${hot.name}\n지금 매장에서 만나보세요`
        : '매장 인기 품목을 준비했습니다',
      footer: 'Best Seller',
      topic: 'hot_item',
      duration: 6,
    }, 1)!,
    normalizeSlidePlan({
      title: pick ? `오늘의 Pick · ${pick.name}` : 'Chef 추천',
      body: pickBody,
      footer: 'Special Pick',
      topic: 'pick_item',
      duration: 6,
    }, 2)!,
    normalizeSlidePlan({
      title: ctx.activeCoupons[0] ? '회원 혜택' : hot2 ? `함께 추천 · ${hot2.name}` : '포인트 적립',
      body: ctx.activeCoupons[0]
        ? ctx.activeCoupons.slice(0, 2).join('\n')
        : hot2
          ? `${hot2.name}도 오늘 준비됐어요`
          : '회원 포인트 적립 · 다양한 결제',
      footer: 'Promotion',
      topic: 'promotion',
      duration: 6,
    }, 3)!,
    normalizeSlidePlan({
      title: `오늘 ${ctx.weather.split('·')[0]?.trim() || '맑음'}`,
      body: ctx.weather.includes('비') || ctx.weather.includes('눈')
        ? '포장·배달도 편리합니다'
        : '신선한 정육, 오늘도 준비했습니다',
      footer: ctx.storeName,
      topic: 'weather',
      duration: 6,
    }, 4)!,
  ].filter(Boolean) as SignageSlidePlan[]);

  return {
    reply: `${ctx.rotation.slotLabel} — 인기 ${hot?.name || '-'}, Pick ${pick?.name || '-'} 반영했습니다. 4시간마다 품목이 바뀝니다.`,
    slides,
    totalDuration: slides.reduce((s, x) => s + x.duration, 0),
  };
}

export function planToSignageContentUrl(slide: SignageSlidePlan): string {
  return JSON.stringify({
    title: slide.title,
    body: slide.body,
    footer: slide.footer || '',
  });
}
