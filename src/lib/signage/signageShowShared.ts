import { getKSTHour, getKSTTodayYMD } from '@/lib/dateUtils';
import type { ItemVelocity, SignageRotationPlan, SignageShowContext } from '@/lib/signage/signageShowContext.types';

function pickRotated<T extends { name: string }>(list: T[], offset: number): T | null {
  if (!list.length) return null;
  return list[offset % list.length];
}

export function computeSignageRotation(
  hot: ItemVelocity[],
  slow: ItemVelocity[],
  now = new Date(),
): SignageRotationPlan {
  const today = getKSTTodayYMD();
  const slot = Math.floor(getKSTHour(now) / 4);
  const seed = today.split('-').reduce((a, p) => a + Number(p), 0) + slot * 17;

  const slotLabels = ['새벽', '오전', '점심', '오후', '저녁', '심야'];

  return {
    slotLabel: `${slotLabels[slot] || '오늘'} 로테이션`,
    featuredHot: pickRotated(hot, seed),
    featuredSlow: pickRotated(slow, seed + 1),
    alternateHot: pickRotated(hot, seed + 2),
    alternateSlow: pickRotated(slow, seed + 3),
  };
}

export function formatSignageCustomerContextBlock(ctx: SignageShowContext): string {
  const lines = [
    `매장명: ${ctx.storeName}`,
    `날씨: ${ctx.weather}`,
    `로테이션: ${ctx.rotation.slotLabel}`,
  ];

  if (ctx.rotation.featuredHot) {
    lines.push(`★ 이번 슬롯 인기 품목(1장 필수): ${ctx.rotation.featuredHot.name}`);
  }
  if (ctx.rotation.featuredSlow) {
    lines.push(`★ 이번 슬롯 추천 유도(1장 필수, '오늘의 Pick'·'Chef 추천' 톤): ${ctx.rotation.featuredSlow.name}`);
  }
  if (ctx.rotation.alternateHot) lines.push(`보조 인기: ${ctx.rotation.alternateHot.name}`);
  if (ctx.rotation.alternateSlow) lines.push(`보조 추천: ${ctx.rotation.alternateSlow.name}`);

  if (ctx.hotItems.length) {
    lines.push(`인기 풀: ${ctx.hotItems.slice(0, 6).map(i => i.name).join(', ')}`);
  }
  if (ctx.slowItems.length) {
    lines.push(`추천 유도 풀: ${ctx.slowItems.slice(0, 6).map(i => i.name).join(', ')}`);
  }
  if (ctx.activeCoupons.length) lines.push(`혜택: ${ctx.activeCoupons.join(' | ')}`);
  if (ctx.customerEvents.length) lines.push(`이벤트: ${ctx.customerEvents.join(' | ')}`);

  lines.push(
    '',
    '슬라이드 4~5장 (20~30초): welcome → hot_item → pick_item → promotion/hygiene → weather/brand',
    'pick_item는 저회전 품목을 맛·신선·레시피·한정 추천으로 구매 유도 (재고·매출·운영 언급 금지)',
  );

  return lines.join('\n');
}

export function formatSignageRotationSummary(ctx: SignageShowContext): string[] {
  const out: string[] = [ctx.rotation.slotLabel];
  if (ctx.rotation.featuredHot) out.push(`인기: ${ctx.rotation.featuredHot.name}`);
  if (ctx.rotation.featuredSlow) out.push(`오늘의 Pick: ${ctx.rotation.featuredSlow.name}`);
  return out;
}

export type { SignageShowContext } from '@/lib/signage/signageShowContext.types';
