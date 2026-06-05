import type { CouponDiscountType } from './types';

export function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export interface CouponRuleData {
  isActive?: boolean;
  startDate?: string | null;
  endDate?: string | null;
  maxUse?: number;
  usedCount?: number;
  minAmount?: number;
  type?: CouponDiscountType | string;
  value?: number;
  maxDiscount?: number;
}

export type CouponRuleCheck = { ok: true } | { ok: false; message: string };

export function validateCouponRules(
  data: CouponRuleData,
  orderAmount: number,
): CouponRuleCheck {
  const today = todayKST();

  if (!data.isActive) return { ok: false, message: '비활성 쿠폰입니다' };
  if (data.startDate && today < data.startDate) {
    return { ok: false, message: `사용 시작일은 ${data.startDate} 입니다` };
  }
  if (data.endDate && today > data.endDate) {
    return { ok: false, message: '쿠폰 유효기간이 만료되었습니다' };
  }
  if ((data.maxUse || 0) > 0 && (data.usedCount || 0) >= (data.maxUse || 0)) {
    return { ok: false, message: '쿠폰 사용 한도에 도달했습니다' };
  }
  if ((data.minAmount || 0) > 0 && orderAmount < (data.minAmount || 0)) {
    return {
      ok: false,
      message: `최소 주문금액 ${(data.minAmount || 0).toLocaleString('ko-KR')}원 이상이어야 합니다`,
    };
  }

  return { ok: true };
}

export function calculateCouponDiscount(
  data: Pick<CouponRuleData, 'type' | 'value' | 'maxDiscount'>,
  orderAmount: number,
): number {
  const amount = Math.max(0, orderAmount);
  const type = data.type === 'fixed' ? 'fixed' : 'percent';
  const value = Number(data.value) || 0;

  if (type === 'percent') {
    let discount = Math.round(amount * (value / 100));
    if ((data.maxDiscount || 0) > 0) discount = Math.min(discount, data.maxDiscount || 0);
    return discount;
  }
  return Math.min(value, amount);
}
