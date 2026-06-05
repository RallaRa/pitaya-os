/** Gemini Imagen 3.0 — 사이니지 배경 이미지 생성 */

export function getGeminiApiKey(): string {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key?.trim()) throw new Error('GEMINI_API_KEY 미설정');
  return key.trim();
}

const IMAGEN_ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/imagen-3.0-generate-001:predict';

export function buildSignageImagePrompt(userPrompt: string, backgroundOnly = false): string {
  const base = `정육점 사이니지용 이미지. ${userPrompt.trim()}. 고품질, 상업용, 가로형 16:9, 선명하고 식욕을 돋우는 이미지`;
  if (backgroundOnly) {
    return `${base}. 이미지 안에 글자, 숫자, 로고, 텍스트를 넣지 마세요.`;
  }
  return base;
}

interface ImagenPredictResponse {
  predictions?: { bytesBase64Encoded?: string; mimeType?: string }[];
  error?: { message?: string; code?: number };
}

export async function generateImagenImageBuffer(prompt: string, backgroundOnly = false): Promise<Buffer> {
  const apiKey = getGeminiApiKey();
  const res = await fetch(`${IMAGEN_ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      instances: [{ prompt: buildSignageImagePrompt(prompt, backgroundOnly) }],
      parameters: { sampleCount: 1, aspectRatio: '16:9' },
    }),
  });

  const raw = await res.text();
  let data: ImagenPredictResponse;
  try {
    data = JSON.parse(raw) as ImagenPredictResponse;
  } catch {
    throw new Error(raw || `Imagen API 오류 (${res.status})`);
  }

  if (!res.ok) {
    throw new Error(data.error?.message || raw || `Imagen API 오류 (${res.status})`);
  }

  const b64 = data.predictions?.[0]?.bytesBase64Encoded;
  if (!b64) throw new Error('Imagen 이미지 생성 실패 (응답에 이미지 없음)');
  return Buffer.from(b64, 'base64');
}
