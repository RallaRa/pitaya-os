/** 브라우저 Canvas + MediaRecorder — 사이니지 영상/슬라이드 합성 */

const WIDTH = 1920;
const HEIGHT = 1080;
const NOTO_CSS =
  'https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;700;900&display=swap';

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

function drawTextOverlay(ctx: CanvasRenderingContext2D, title: string, bodyText?: string): void {
  const bottomThirdTop = HEIGHT * (2 / 3);
  const grad = ctx.createLinearGradient(0, bottomThirdTop, 0, HEIGHT);
  grad.addColorStop(0, 'rgba(0,0,0,0)');
  grad.addColorStop(0.35, 'rgba(0,0,0,0.55)');
  grad.addColorStop(1, 'rgba(0,0,0,0.8)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bottomThirdTop, WIDTH, HEIGHT - bottomThirdTop);

  const centerX = WIDTH / 2;
  const maxWidth = WIDTH - 160;
  let y = bottomThirdTop + 48;

  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.font = '900 72px "Noto Sans KR", sans-serif';
  y += drawTextBlock(ctx, title, centerX, y, maxWidth, 86) + 20;

  if (bodyText?.trim()) {
    ctx.font = '400 48px "Noto Sans KR", sans-serif';
    drawTextBlock(ctx, bodyText.trim(), centerX, y, maxWidth, 58);
  }
}

async function createComposedCanvas(
  backgroundSrc: string,
  title: string,
  bodyText?: string,
): Promise<HTMLCanvasElement> {
  await loadNotoSansKR();
  const img = await loadImage(backgroundSrc);
  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas를 사용할 수 없습니다');

  const scale = Math.max(WIDTH / img.width, HEIGHT / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (WIDTH - dw) / 2, (HEIGHT - dh) / 2, dw, dh);
  drawTextOverlay(ctx, title, bodyText);
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
  const canvas = await createComposedCanvas(opts.backgroundSrc, opts.title, opts.bodyText);
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
  const canvas = await createComposedCanvas(opts.backgroundSrc, opts.title, opts.bodyText);
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
