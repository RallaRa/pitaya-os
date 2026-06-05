/** Gemini Imagen / Native Image — 사이니지 배경 이미지 생성 */

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';

const DEFAULT_IMAGEN_MODEL = 'imagen-4.0-fast-generate-001';
const DEFAULT_GEMINI_IMAGE_MODEL = 'gemini-2.5-flash-image';

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key?.trim()) throw new Error('GEMINI_API_KEY 미설정');
  return key.trim();
}

function imagenModel(): string {
  return process.env.IMAGEN_MODEL?.trim() || DEFAULT_IMAGEN_MODEL;
}

function geminiImageModel(): string {
  return process.env.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
}

export function buildSignageImagePrompt(userPrompt: string, backgroundOnly = false): string {
  const base = `정육점 사이니지용 이미지. ${userPrompt.trim()}. 고품질, 상업용, 가로형 16:9, 선명하고 식욕을 돋우는 이미지`;
  if (backgroundOnly) {
    return `${base}. 이미지 안에 글자, 숫자, 로고, 텍스트를 넣지 마세요.`;
  }
  return base;
}

interface ImagenPredictResponse {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  error?: { message?: string; code?: number; status?: string };
}

interface GeminiGenerateContentResponse {
  candidates?: {
    content?: {
      parts?: { inlineData?: { data?: string; mimeType?: string }; text?: string }[];
    };
  }[];
  error?: { message?: string; code?: number; status?: string };
}

function formatImageApiError(message: string, status?: number): string {
  const msg = message || `이미지 API 오류 (${status ?? 'unknown'})`;
  if (/not found for API version|is not supported for predict/i.test(msg)) {
    return `이미지 모델(${imagenModel()})을 사용할 수 없습니다. Google AI Studio에서 Imagen 4 결제·활성화 후 IMAGEN_MODEL 환경변수를 확인하세요.`;
  }
  if (/paid plans|upgrade your account|billing/i.test(msg)) {
    return 'Imagen 이미지 생성은 Google AI Studio 유료(결제) 플랜이 필요합니다. https://ai.dev/projects 에서 결제를 활성화해 주세요.';
  }
  if (/429|quota|rate limit|RESOURCE_EXHAUSTED/i.test(msg)) {
    return 'Gemini 이미지 생성 할당량을 초과했습니다. 잠시 후 다시 시도하거나 Google AI Studio 결제·할당량을 확인하세요.';
  }
  return msg;
}

async function generateWithImagenPredict(fullPrompt: string): Promise<Buffer> {
  const apiKey = getGeminiApiKey();
  const model = imagenModel();
  const res = await fetch(`${GEMINI_BASE}/models/${model}:predict?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: fullPrompt }],
      parameters: { sampleCount: 1, aspectRatio: '16:9' },
    }),
  });

  const raw = await res.text();
  let data: ImagenPredictResponse;
  try {
    data = JSON.parse(raw) as ImagenPredictResponse;
  } catch {
    throw new Error(formatImageApiError(raw, res.status));
  }

  if (!res.ok) {
    throw new Error(formatImageApiError(data.error?.message || raw, res.status));
  }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen 이미지 생성 실패 (응답에 이미지 없음)');
  return Buffer.from(b64, 'base64');
}

async function generateWithGeminiNativeImage(fullPrompt: string): Promise<Buffer> {
  const apiKey = getGeminiApiKey();
  const model = geminiImageModel();
  const res = await fetch(`${GEMINI_BASE}/models/${model}:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: fullPrompt }] }],
      generationConfig: {
        responseModalities: ['IMAGE'],
        imageConfig: { aspectRatio: '16:9' },
      },
    }),
  });

  const raw = await res.text();
  let data: GeminiGenerateContentResponse;
  try {
    data = JSON.parse(raw) as GeminiGenerateContentResponse;
  } catch {
    throw new Error(formatImageApiError(raw, res.status));
  }

  if (!res.ok) {
    throw new Error(formatImageApiError(data.error?.message || raw, res.status));
  }

  const parts = data.candidates?.[0]?.content?.parts ?? [];
  for (const part of parts) {
    if (part.inlineData?.data) {
      return Buffer.from(part.inlineData.data, 'base64');
    }
  }

  throw new Error('Gemini 이미지 생성 실패 (응답에 이미지 없음)');
}

function shouldFallbackFromImagen(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err);
  return /not found|not supported|paid plans|upgrade your account|billing|INVALID_ARGUMENT/i.test(msg);
}

export async function generateImagenImageBuffer(prompt: string, backgroundOnly = false): Promise<Buffer> {
  const fullPrompt = buildSignageImagePrompt(prompt, backgroundOnly);

  try {
    return await generateWithImagenPredict(fullPrompt);
  } catch (imagenErr) {
    if (!shouldFallbackFromImagen(imagenErr)) throw imagenErr;
    console.warn('[signage imagen] Imagen failed, trying Gemini native image:', imagenErr);
    return generateWithGeminiNativeImage(fullPrompt);
  }
}
