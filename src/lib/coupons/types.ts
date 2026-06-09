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
  /** @deprecated 레이아웃 AI로 분리 — 쿠폰 문구 AI에서는 사용 안 함 */
  imagePrompt: string;
  includeBarcode: boolean;
  /** 카드 이미지에 표시할 프로모 문구 (구간 할인 등) */
  bodyLines: string[];
  layoutId?: string;
}

export interface CouponLayoutDoc {
  id?: string;
  storeId: string;
  name: string;
  backgroundUrl: string;
  imagePrompt?: string;
  includeBarcodeDefault?: boolean;
  isDefault?: boolean;
  createdAt?: unknown;
}

export interface CouponCopyItem {
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
  bodyLines: string[];
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
  layoutId?: string;
  bodyLines?: string[];
  barcodeValue?: string;
  includeBarcode?: boolean;
  createdAt?: unknown;
  updatedAt?: unknown;
}

export interface CouponCopyChatResult {
  reply: string;
  draft: CouponCopyItem;
  /** 한 번에 여러 쿠폰 제안 시 (예: 구간별 별도 코드) */
  extraCoupons: CouponCopyItem[];
  readyToPublish: boolean;
}

/** @deprecated CouponCopyChatResult 사용 */
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
  includeBarcode: false,
  bodyLines: [],
};

export const EMPTY_COUPON_COPY: CouponCopyItem = {
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
  bodyLines: [],
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
