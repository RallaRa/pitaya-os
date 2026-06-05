export type CouponDiscountType = 'percent' | 'fixed';

export interface CouponDraft {
  code: string;
  title: string;
  description: string;
  type: CouponDiscountType;
  value: number;
  minAmount: number;
  maxDiscount: number;
  maxUse: number;
  startDate: string;
  endDate: string;
  imagePrompt: string;
}

export interface CouponDoc {
  id?: string;
  storeId: string;
  code: string;
  type: CouponDiscountType;
  value: number;
  minAmount: number;
  maxDiscount: number;
  maxUse: number;
  usedCount: number;
  startDate: string | null;
  endDate: string | null;
  isActive: boolean;
  title?: string;
  description?: string;
  imageUrl?: string;
  imagePrompt?: string;
  barcodeValue?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CouponAiChatResult {
  reply: string;
  draft: CouponDraft;
  readyToPublish: boolean;
}

export const EMPTY_COUPON_DRAFT: CouponDraft = {
  code: '',
  title: '',
  description: '',
  type: 'percent',
  value: 10,
  minAmount: 0,
  maxDiscount: 0,
  maxUse: 0,
  startDate: '',
  endDate: '',
  imagePrompt: '',
};

export function discountLabel(type: CouponDiscountType, value: number): string {
  if (type === 'percent') return `${value}% 할인`;
  return `${value.toLocaleString('ko-KR')}원 할인`;
}

export function sanitizeCouponCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]/g, '')
    .slice(0, 24);
}
