import { sanitizeBackgroundPrompt } from '@/lib/signage/generateBackgroundImage';
import type { CouponDraft } from './types';
import { discountLabel } from './types';

/** FLUX/DALL-E용 쿠폰 배경 프롬프트 — 글자 없는 장면 */
export function buildCouponImagePrompt(draft: Pick<CouponDraft, 'title' | 'imagePrompt' | 'type' | 'value'>): string {
  const scene = sanitizeBackgroundPrompt(
    draft.imagePrompt
    || draft.title
    || `${discountLabel(draft.type, draft.value)} promotion`,
  );

  return [
    'Premium Korean butcher shop coupon card background, portrait orientation.',
    `Theme: ${scene}.`,
    'Appetizing fresh meat, warm lighting, elegant commercial photography.',
    'Leave clean space at bottom for barcode strip.',
    'No text, numbers, logos, watermarks, or letters anywhere in the image.',
  ].join(' ');
}
