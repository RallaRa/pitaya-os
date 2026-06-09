import { runCouponCopyAi } from './couponCopyAi';
import {
  EMPTY_COUPON_DRAFT,
  type CouponAiChatResult,
  type CouponDraft,
} from './types';

/** @deprecated couponCopyAi.runCouponCopyAi — 문구 전용 AI */
export async function runCouponAiChat(opts: {
  message: string;
  history?: { role: string; content: string }[];
  currentDraft?: Partial<CouponDraft>;
  storeName?: string;
}): Promise<CouponAiChatResult> {
  const result = await runCouponCopyAi({
    message: opts.message,
    history: opts.history,
    currentDraft: opts.currentDraft,
    storeName: opts.storeName,
  });
  const draft: CouponDraft = {
    ...EMPTY_COUPON_DRAFT,
    ...result.draft,
    imagePrompt: '',
    includeBarcode: false,
    bodyLines: result.draft.bodyLines || [],
  };
  return {
    reply: result.reply,
    draft,
    readyToPublish: result.readyToPublish,
  };
}

export { runCouponCopyAi } from './couponCopyAi';
