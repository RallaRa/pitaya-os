import sharp from 'sharp';
import bwipjs from 'bwip-js';

const CARD_WIDTH = 800;
const IMAGE_HEIGHT = 920;
const FOOTER_WITH_BARCODE = 200;
const FOOTER_NO_BARCODE = 120;

export interface RenderCouponCardInput {
  background: Buffer;
  code: string;
  title?: string;
  discountText?: string;
  /** 카드 상단 이미지 영역에 표시 (구간 할인 등) */
  bodyLines?: string[];
  includeBarcode?: boolean;
}

function escapeSvg(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function barcodePng(text: string): Promise<Buffer> {
  return bwipjs.toBuffer({
    bcid: 'code128',
    text: text.slice(0, 48),
    scale: 3,
    height: 14,
    includetext: true,
    textxalign: 'center',
    textsize: 12,
  });
}

function footerSvg(opts: {
  title: string;
  code: string;
  discountText: string;
  includeBarcode: boolean;
  footerHeight: number;
}): Buffer {
  const title = opts.title ? escapeSvg(opts.title.slice(0, 40)) : '';
  const code = escapeSvg(opts.code);
  const discount = escapeSvg(opts.discountText);
  const codeY = opts.includeBarcode ? 188 : 98;
  const titleBlock = title
    ? `<text x="400" y="36" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">${title}</text>`
    : '';
  const discountY = title ? 64 : 44;

  const svg = `
<svg width="${CARD_WIDTH}" height="${opts.footerHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  ${titleBlock}
  <text x="400" y="${discountY}" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#0d9488">${discount}</text>
  <text x="400" y="${codeY}" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="#334155">${code}</text>
</svg>`;
  return Buffer.from(svg);
}

function promoOverlaySvg(bodyLines: string[], title?: string): Buffer | null {
  const lines = bodyLines.filter(Boolean).slice(0, 6);
  if (!lines.length && !title) return null;

  const lineHeight = 36;
  const pad = 24;
  const bandHeight = Math.min(320, pad * 2 + (title ? 44 : 0) + lines.length * lineHeight);
  const bandTop = IMAGE_HEIGHT - bandHeight - 40;

  const titleEsc = title ? escapeSvg(title.slice(0, 30)) : '';
  const lineEls = lines.map((line, i) => {
    const y = bandTop + pad + (title ? 40 : 0) + i * lineHeight + 24;
    return `<text x="400" y="${y}" text-anchor="middle" font-family="Arial, sans-serif" font-size="20" font-weight="600" fill="#ffffff">${escapeSvg(line.slice(0, 48))}</text>`;
  }).join('\n');

  const svg = `
<svg width="${CARD_WIDTH}" height="${IMAGE_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="rgba(15,23,42,0)"/>
      <stop offset="35%" stop-color="rgba(15,23,42,0.55)"/>
      <stop offset="100%" stop-color="rgba(15,23,42,0.82)"/>
    </linearGradient>
  </defs>
  <rect x="0" y="${bandTop}" width="${CARD_WIDTH}" height="${IMAGE_HEIGHT - bandTop}" fill="url(#band)"/>
  ${titleEsc ? `<text x="400" y="${bandTop + pad + 20}" text-anchor="middle" font-family="Arial, sans-serif" font-size="26" font-weight="800" fill="#5eead4">${titleEsc}</text>` : ''}
  ${lineEls}
</svg>`;
  return Buffer.from(svg);
}

/** 배경 + 하단 정보(바코드 선택) 합성 쿠폰 카드 PNG */
export async function renderCouponCard(input: RenderCouponCardInput): Promise<Buffer> {
  const code = String(input.code || '').trim().toUpperCase();
  if (!code) throw new Error('쿠폰 코드가 필요합니다');

  const includeBarcode = input.includeBarcode !== false;
  const footerHeight = includeBarcode ? FOOTER_WITH_BARCODE : FOOTER_NO_BARCODE;
  const cardHeight = IMAGE_HEIGHT + footerHeight;

  const resizedBg = await sharp(input.background)
    .resize(CARD_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const promo = promoOverlaySvg(input.bodyLines || [], input.title);

  const footer = footerSvg({
    title: (input.bodyLines?.length ? '' : (input.title || 'PITAYA COUPON')),
    code,
    discountText: input.discountText || '',
    includeBarcode,
    footerHeight,
  });

  const composites: sharp.OverlayOptions[] = [
    { input: resizedBg, top: 0, left: 0 },
  ];
  if (promo) composites.push({ input: promo, top: 0, left: 0 });
  composites.push({ input: footer, top: IMAGE_HEIGHT, left: 0 });

  if (includeBarcode) {
    const barcode = await barcodePng(code);
    const barcodeMeta = await sharp(barcode).metadata();
    const barcodeW = barcodeMeta.width || 400;
    const barcodeX = Math.round((CARD_WIDTH - barcodeW) / 2);
    composites.push({ input: barcode, top: IMAGE_HEIGHT + 72, left: barcodeX });
  }

  return sharp({
    create: {
      width: CARD_WIDTH,
      height: cardHeight,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite(composites)
    .png()
    .toBuffer();
}
