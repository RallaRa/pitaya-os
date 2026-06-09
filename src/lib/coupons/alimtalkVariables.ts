import { discountLabel, sanitizeCouponCode, type CouponDoc } from '@/lib/coupons/types';

export interface AlimtalkCouponVariables {
  add1: string;
  add2: string;
  add3: string;
}

export interface AlimtalkCouponPayload {
  couponId: string;
  code: string;
  title?: string;
  variables: AlimtalkCouponVariables;
  campaignKey: string;
  previewLabel: string;
}

export function formatCouponEndDateForAlimtalk(endDate?: string | null): string {
  if (!endDate) return '기한 없음';
  return `~${endDate.replace(/-/g, '.')}까지`;
}

export function buildAlimtalkCampaignKey(code: string, asOf = new Date()): string {
  const ymd = asOf.toISOString().slice(0, 10).replace(/-/g, '');
  return `coupon_${sanitizeCouponCode(code).toLowerCase()}_${ymd}`;
}

export function buildAlimtalkFromCoupon(
  coupon: Pick<CouponDoc, 'id' | 'code' | 'type' | 'value' | 'endDate' | 'title'>,
): AlimtalkCouponPayload {
  const code = sanitizeCouponCode(coupon.code);
  const variables: AlimtalkCouponVariables = {
    add1: code,
    add2: discountLabel(coupon.type, coupon.value),
    add3: formatCouponEndDateForAlimtalk(coupon.endDate),
  };
  const campaignKey = buildAlimtalkCampaignKey(code);
  const previewLabel = [variables.add1, variables.add2, variables.add3].filter(Boolean).join(' · ');
  return {
    couponId: String(coupon.id || ''),
    code,
    title: coupon.title,
    variables,
    campaignKey,
    previewLabel,
  };
}

/** 클라이언트용 — 목록에서 선택한 쿠폰 객체 */
export function buildAlimtalkFromCouponRow(coupon: {
  id: string;
  code: string;
  type: 'percent' | 'fixed';
  value: number;
  endDate?: string | null;
  title?: string;
}): AlimtalkCouponPayload {
  return buildAlimtalkFromCoupon({ ...coupon, endDate: coupon.endDate ?? null });
}
