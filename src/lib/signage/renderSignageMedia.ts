/** 브라우저 Canvas + MediaRecorder — 사이니지 영상/슬라이드·쿠폰 카드 합성 */

const LANDSCAPE_WIDTH = 1920;
const LANDSCAPE_HEIGHT = 1080;

export const COUPON_WIDTH = 800;
export const COUPON_IMAGE_HEIGHT = 920;
export const COUPON_FOOTER_HEIGHT = 200;

const NOTO_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap';

interface CanvasLayout {
  width: number;
  height: number;
  imageHeight: number;
  titleFont: string;
  bodyFont: string;
  titleLineHeight: number;
  bodyLineHeight: number;
  overlayPadTop: number;
  textPadX: number;
}

const LANDSCAPE_LAYOUT: CanvasLayout = {
  width: LANDSCAPE_WIDTH,
  height: LANDSCAPE_HEIGHT,
  imageHeight: LANDSCAPE_HEIGHT,
  titleFont: '900 72px "Noto Sans KR", sans-serif',
  bodyFont: '400 48px "Noto Sans KR", sans-serif',
  titleLineHeight: 86,
  bodyLineHeight: 58,
  overlayPadTop: 48,
  textPadX: 160,
};

const COUPON_LAYOUT: CanvasLayout = {
  width: COUPON_WIDTH,
  height: COUPON_IMAGE_HEIGHT + COUPON_FOOTER_HEIGHT,
  imageHeight: COUPON_IMAGE_HEIGHT,
  titleFont: '900 36px "Noto Sans KR", sans-serif',
  bodyFont: '400 24px "Noto Sans KR", sans-serif',
  titleLineHeight: 44,
  bodyLineHeight: 32,
  overlayPadTop: 28,
  textPadX: 48,
};

async function loadNotoSansKR(): Promise<void> {
  if (!document.querySelector('link[data-signage-noto]')) {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = NOTO_CSS;
    link.setAttribute('data-signage-noto', '1');
    document.head.appendChild(link);
  }
  await Promise.all([
    document.fonts.load('900 72px "Noto Sans KR"'),
    document.fonts.load('400 48px "Noto Sans KR"'),
  ]);
  await document.fonts.ready;
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('배경 이미지 로드 실패'));
    img.src = src;
  });
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = '';

  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines.length ? lines : [''];
}

function drawTextBlock(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  maxWidth: number,
  lineHeight: number,
): number {
  const lines = wrapText(ctx, text, maxWidth);
  lines.forEach((line, i) => {
    const ly = y + i * lineHeight;
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    ctx.fillText(line, x + 4, ly + 4);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillText(line, x + 8, ly + 8);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(line, x, ly);
  });
  return lines.length * lineHeight;
}

function drawTextOverlay(
  ctx: CanvasRenderingContext2D,
  layout: CanvasLayout,
  title: string,
  bodyText?: string,
): void {
  const bottomThirdTop = layout.imageHeight * (2 / 3);
  const grad = ctx.createLinearGradient(0, bottomThirdTop, 0, layout.imageHeight);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bottomThirdTop, layout.width, layout.imageHeight - bottomThirdTop);

  const centerX = layout.width / 2;
  const maxWidth = layout.width - layout.textPadX;
  let y = bottomThirdTop + layout.overlayPadTop;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = layout.titleFont;
  y += drawTextBlock(ctx, title, centerX, y, maxWidth, layout.titleLineHeight) + 12;

  if (bodyText?.trim()) {
    ctx.font = layout.bodyFont;
    drawTextBlock(ctx, bodyText.trim(), centerX, y, maxWidth, layout.bodyLineHeight);
  }
}

function drawCouponFooter(
  ctx: CanvasRenderingContext2D,
  layout: typeof COUPON_LAYOUT,
  code: string,
  includeBarcode: boolean,
): void {
  const footerTop = layout.imageHeight;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, footerTop, layout.width, COUPON_FOOTER_HEIGHT);
  ctx.strokeStyle = '#e2e8f0';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, footerTop);
  ctx.lineTo(layout.width, footerTop);
  ctx.stroke();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#0d9488';
  ctx.font = '600 14px "Noto Sans KR", sans-serif';
  ctx.fillText('PITAYA COUPON', layout.width / 2, footerTop + 36);

  ctx.fillStyle = '#334155';
  ctx.font = '700 20px monospace, sans-serif';
  ctx.fillText(code, layout.width / 2, footerTop + (includeBarcode ? 108 : 88));

  if (includeBarcode) {
    ctx.fillStyle = '#64748b';
    ctx.font = '400 11px monospace, sans-serif';
    ctx.fillText('POS 스캔용 코드', layout.width / 2, footerTop + 148);
  }
}

async function createComposedCanvas(
  backgroundSrc: string,
  title: string,
  bodyText: string | undefined,
  layout: CanvasLayout,
  footer?: { code: string; includeBarcode: boolean },
): Promise<HTMLCanvasElement> {
  await loadNotoSansKR();
  const img = await loadImage(backgroundSrc);
  const canvas = document.createElement('canvas');
  canvas.width = layout.width;
  canvas.height = layout.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas를 사용할 수 없습니다');

  const scale = Math.max(layout.width / img.width, layout.imageHeight / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (layout.width - dw) / 2, (layout.imageHeight - dh) / 2, dw, dh);
  drawTextOverlay(ctx, layout, title, bodyText);
  if (footer) {
    drawCouponFooter(ctx, COUPON_LAYOUT, footer.code, footer.includeBarcode);
  }
  return canvas;
}

export interface RenderSignageMediaOptions {
  backgroundSrc: string;
  title: string;
  bodyText?: string;
  durationSec?: number;
  onProgress?: (message: string) => void;
}

export async function renderSignageSlideImage(opts: RenderSignageMediaOptions): Promise<Blob> {
  opts.onProgress?.('슬라이드 합성 중…');
  const canvas = await createComposedCanvas(
    opts.backgroundSrc,
    opts.title,
    opts.bodyText,
    LANDSCAPE_LAYOUT,
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('PNG 변환 실패'))),
      'image/png',
    );
  });
}

export interface RenderCouponCardOptions {
  backgroundSrc: string;
  title: string;
  bodyText?: string;
  code: string;
  includeBarcode?: boolean;
  onProgress?: (message: string) => void;
}

/** 쿠폰 카드 — 사이니지와 동일 FLUX 배경 + Canvas 한글 합성 (세로 4:5) */
export async function renderCouponCardImage(opts: RenderCouponCardOptions): Promise<Blob> {
  opts.onProgress?.('쿠폰 카드 합성 중…');
  const code = opts.code.trim().toUpperCase();
  if (!code) throw new Error('쿠폰 코드가 필요합니다');
  const canvas = await createComposedCanvas(
    opts.backgroundSrc,
    opts.title || code,
    opts.bodyText,
    COUPON_LAYOUT,
    { code, includeBarcode: opts.includeBarcode !== false },
  );
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      blob => (blob ? resolve(blob) : reject(new Error('PNG 변환 실패'))),
      'image/png',
    );
  });
}

function pickRecorderMimeType(): string {
  const candidates = [
    'video/webm;codecs=vp9',
    'video/webm;codecs=vp8',
    'video/webm',
    'video/mp4',
  ];
  return candidates.find(t => MediaRecorder.isTypeSupported(t)) || 'video/webm';
}

export async function renderSignageVideo(opts: RenderSignageMediaOptions): Promise<Blob> {
  opts.onProgress?.('영상 합성 준비 중…');
  const canvas = await createComposedCanvas(
    opts.backgroundSrc,
    opts.title,
    opts.bodyText,
    LANDSCAPE_LAYOUT,
  );
  const durationSec = opts.durationSec ?? 10;
  const mimeType = pickRecorderMimeType();
  const stream = canvas.captureStream(30);

  opts.onProgress?.(`영상 녹화 중… (${durationSec}초)`);

  return new Promise((resolve, reject) => {
    const chunks: BlobPart[] = [];
    const recorder = new MediaRecorder(stream, {
      mimeType,
      videoBitsPerSecond: 5_000_000,
    });

    recorder.ondataavailable = e => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    recorder.onerror = () => reject(new Error('영상 녹화 실패'));
    recorder.onstop = () => {
      stream.getTracks().forEach(t => t.stop());
      const type = mimeType.split(';')[0];
      resolve(new Blob(chunks, { type }));
    };

    recorder.start(250);
    setTimeout(() => {
      if (recorder.state !== 'inactive') recorder.stop();
    }, durationSec * 1000);
  });
}
