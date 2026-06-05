import sharp from 'sharp';
import bwipjs from 'bwip-js';

const CARD_WIDTH = 800;
const IMAGE_HEIGHT = 920;
const FOOTER_HEIGHT = 200;
const CARD_HEIGHT = IMAGE_HEIGHT + FOOTER_HEIGHT;

export interface RenderCouponCardInput {
  background: Buffer;
  code: string;
  title?: string;
  discountText?: string;
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

function footerSvg(opts: { title: string; code: string; discountText: string }): Buffer {
  const title = escapeSvg(opts.title.slice(0, 40));
  const code = escapeSvg(opts.code);
  const discount = escapeSvg(opts.discountText);

  const svg = `
<svg width="${CARD_WIDTH}" height="${FOOTER_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="400" y="36" text-anchor="middle" font-family="Arial, sans-serif" font-size="22" font-weight="700" fill="#0f172a">${title}</text>
  <text x="400" y="64" text-anchor="middle" font-family="Arial, sans-serif" font-size="16" fill="#0d9488">${discount}</text>
  <text x="400" y="188" text-anchor="middle" font-family="monospace" font-size="18" font-weight="700" fill="#334155">${code}</text>
</svg>`;
  return Buffer.from(svg);
}

/** 배경 + 하단 바코드·코드가 합성된 쿠폰 카드 PNG */
export async function renderCouponCard(input: RenderCouponCardInput): Promise<Buffer> {
  const code = String(input.code || '').trim().toUpperCase();
  if (!code) throw new Error('쿠폰 코드가 필요합니다');

  const resizedBg = await sharp(input.background)
    .resize(CARD_WIDTH, IMAGE_HEIGHT, { fit: 'cover', position: 'centre' })
    .png()
    .toBuffer();

  const [barcode, footer] = await Promise.all([
    barcodePng(code),
    Promise.resolve(footerSvg({
      title: input.title || 'PITAYA COUPON',
      code,
      discountText: input.discountText || '',
    })),
  ]);

  const barcodeMeta = await sharp(barcode).metadata();
  const barcodeW = barcodeMeta.width || 400;
  const barcodeH = barcodeMeta.height || 80;
  const barcodeX = Math.round((CARD_WIDTH - barcodeW) / 2);
  const barcodeY = IMAGE_HEIGHT + 72;

  return sharp({
    create: {
      width: CARD_WIDTH,
      height: CARD_HEIGHT,
      channels: 3,
      background: '#ffffff',
    },
  })
    .composite([
      { input: resizedBg, top: 0, left: 0 },
      { input: footer, top: IMAGE_HEIGHT, left: 0 },
      { input: barcode, top: barcodeY, left: barcodeX },
    ])
    .png()
    .toBuffer();
}
