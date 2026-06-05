/** 사이니지 배경 이미지 — Cloudflare FLUX → DALL-E 폴백 */

import OpenAI from 'openai';
import type { ImageGenerateParamsNonStreaming } from 'openai/resources/images';

export type SignageImageProvider = 'cloudflare-flux' | 'dall-e';

export interface SignageBackgroundImageResult {
  buffer: Buffer;
  provider: SignageImageProvider;
  contentType: 'image/png' | 'image/jpeg';
}

const CF_MODEL = '@cf/black-forest-labs/flux-1-schnell';
const CF_STEPS = 4;

const TEXT_IN_PROMPT_PATTERNS: RegExp[] = [
  /\d{1,3}(,\d{3})+\s*원/g,
  /\d+\s*원/g,
  /₩\s*\d+/g,
  /[\d.]+\s*won/gi,
  /["'「」『』""'']([^"'「」『』""'']+)["'「」『』""'']/g,
];

/** 이미지 API용 — 가격·따옴표 슬로건만 제거, 한글 장면 설명은 그대로 유지 */
export function sanitizeBackgroundPrompt(userPrompt: string): string {
  let scene = userPrompt.trim();
  for (const pattern of TEXT_IN_PROMPT_PATTERNS) {
    scene = scene.replace(pattern, ' ');
  }
  scene = scene.replace(/\s+/g, ' ').trim();
  return scene || '정육점 내부, 신선한 고기, 따뜻한 조명';
}

export function buildSignageBackgroundPrompt(userPrompt: string): string {
  const scene = sanitizeBackgroundPrompt(userPrompt);
  return [
    '정육점 사이니지용 배경 사진.',
    `분위기·장면·컨셉: ${scene}.`,
    '고품질 상업용 사진, 가로 16:9 구도, 선명하고 식욕을 돋우는 연출.',
    '이미지 안에 글자, 숫자, 로고, 간판, 라벨, 워터마크를 절대 넣지 마세요.',
  ].join(' ');
}

function cloudflareConfig(): { accountId: string; token: string } | null {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID?.trim();
  const token = process.env.CLOUDFLARE_API_TOKEN?.trim();
  if (!accountId || !token) return null;
  return { accountId, token };
}

interface CloudflareRunResponse {
  result?: { image?: string };
  success?: boolean;
  errors?: { message?: string }[];
}

async function generateWithCloudflareFlux(fullPrompt: string): Promise<Buffer> {
  const cfg = cloudflareConfig();
  if (!cfg) {
    throw new Error(
      'CLOUDFLARE_ACCOUNT_ID 또는 CLOUDFLARE_API_TOKEN 미설정. https://dash.cloudflare.com → Workers AI → Use REST API에서 발급하세요.',
    );
  }

  const url = `https://api.cloudflare.com/client/v4/accounts/${cfg.accountId}/ai/run/${CF_MODEL}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt: fullPrompt,
      steps: CF_STEPS,
    }),
  });

  const raw = await res.text();
  let data: CloudflareRunResponse;
  try {
    data = JSON.parse(raw) as CloudflareRunResponse;
  } catch {
    throw new Error(raw || `Cloudflare Workers AI 오류 (${res.status})`);
  }

  if (!res.ok || data.success === false) {
    const errMsg = data.errors?.[0]?.message || raw || `Cloudflare Workers AI 오류 (${res.status})`;
    throw new Error(errMsg);
  }

  const b64 = data.result?.image;
  if (!b64) throw new Error('Cloudflare FLUX 이미지 생성 실패 (응답에 이미지 없음)');
  return Buffer.from(b64, 'base64');
}

function isGptImageModel(model: string): boolean {
  return model.startsWith('gpt-image');
}

async function imageBufferFromOpenAiResponse(data: OpenAI.Images.ImagesResponse['data']): Promise<Buffer> {
  const item = data?.[0];
  if (item?.b64_json) {
    return Buffer.from(item.b64_json, 'base64');
  }
  if (item?.url) {
    const imgRes = await fetch(item.url);
    if (!imgRes.ok) throw new Error('DALL-E 생성 이미지 다운로드 실패');
    return Buffer.from(await imgRes.arrayBuffer());
  }
  throw new Error('DALL-E 이미지 생성 실패');
}

async function generateWithDalle(fullPrompt: string): Promise<Buffer> {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) {
    throw new Error(
      'OPENAI_API_KEY 미설정 (DALL-E 폴백 불가). Cloudflare 설정을 확인하거나 OpenAI 키를 추가하세요.',
    );
  }

  const model = process.env.OPENAI_IMAGE_MODEL?.trim() || 'gpt-image-1';
  const gptImage = isGptImageModel(model);

  const genParams: ImageGenerateParamsNonStreaming = {
    model,
    prompt: fullPrompt,
    n: 1,
    size: gptImage ? '1536x1024' : '1792x1024',
    quality: gptImage
      ? (process.env.OPENAI_IMAGE_QUALITY as 'low' | 'medium' | 'high' | undefined) || 'medium'
      : 'standard',
    ...(gptImage
      ? { output_format: 'png' }
      : { response_format: 'url' }),
  };

  const openai = new OpenAI({ apiKey });
  const response = await openai.images.generate(genParams);
  return imageBufferFromOpenAiResponse(response.data);
}

export async function generateSignageBackgroundImage(
  userPrompt: string,
): Promise<SignageBackgroundImageResult> {
  const fullPrompt = buildSignageBackgroundPrompt(userPrompt);

  if (cloudflareConfig()) {
    try {
      const buffer = await generateWithCloudflareFlux(fullPrompt);
      console.log('[signage generate-image] provider=cloudflare-flux model=%s', CF_MODEL);
      return { buffer, provider: 'cloudflare-flux', contentType: 'image/jpeg' };
    } catch (cfErr) {
      console.warn('[signage generate-image] cloudflare-flux failed, falling back to dall-e:', cfErr);
    }
  } else {
    console.warn(
      '[signage generate-image] Cloudflare 미설정 — DALL-E 폴백 시도. https://dash.cloudflare.com 에서 Account ID·API Token 발급',
    );
  }

  const buffer = await generateWithDalle(fullPrompt);
  console.log('[signage generate-image] provider=dall-e');
  return { buffer, provider: 'dall-e', contentType: 'image/png' };
}
