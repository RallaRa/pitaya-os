/** 쿠폰 이미지 — 사이니지 FLUX 배경 + Canvas 합성 + 업로드 */

import { getAuthJsonHeaders } from '@/lib/getAuthHeaders';
import { renderCouponCardImage } from '@/lib/signage/renderSignageMedia';
import { sanitizeCouponCode } from '@/lib/coupons/types';

export interface ComposeCouponImageInput {
  storeId: string;
  backgroundSrc: string;
  title: string;
  bodyLines?: string[];
  code: string;
  includeBarcode?: boolean;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

export async function composeCouponImageBlob(input: ComposeCouponImageInput): Promise<Blob> {
  const code = sanitizeCouponCode(input.code);
  if (!code) throw new Error('쿠폰 코드가 필요합니다');
  const bodyText = (input.bodyLines || []).filter(Boolean).join('\n');
  return renderCouponCardImage({
    backgroundSrc: input.backgroundSrc,
    title: input.title || code,
    bodyText,
    code,
    includeBarcode: input.includeBarcode !== false,
  });
}

export async function composeAndUploadCouponImage(
  input: ComposeCouponImageInput,
): Promise<string> {
  const code = sanitizeCouponCode(input.code);
  const blob = await composeCouponImageBlob(input);
  const fileContent = await blobToDataUrl(blob);
  const headers = await getAuthJsonHeaders();
  const res = await fetch('/api/coupons/upload-image', {
    method: 'POST',
    headers,
    body: JSON.stringify({
      storeId: input.storeId,
      code,
      fileContent,
      fileName: `${code}.png`,
      mimeType: 'image/png',
      includeBarcode: false,
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || '이미지 업로드 실패');
  return data.imageUrl as string;
}
