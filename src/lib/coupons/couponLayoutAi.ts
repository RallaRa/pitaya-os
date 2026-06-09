import { buildCouponImagePrompt } from '@/lib/coupons/buildCouponPrompt';
import { generateSignageBackgroundImage, sanitizeBackgroundPrompt } from '@/lib/signage/generateBackgroundImage';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

export interface LayoutAiResult {
  reply: string;
  name: string;
  imagePrompt: string;
  readyToGenerate: boolean;
}

const LAYOUT_SYSTEM = appendStoreBusinessContext(`You design BACKGROUND LAYOUTS ONLY for Korean butcher shop digital coupons.
No coupon text, prices, or promo copy — visual scene only.
Respond ONLY with valid JSON:
{
  "reply": "한국어 — 레이아웃 설명 (짧게)",
  "name": "레이아웃 이름 (한국어 2~8자)",
  "imagePrompt": "English scene description, appetizing meat shop, portrait, NO text in image",
  "readyToGenerate": boolean
}
Rules:
- imagePrompt: premium butcher shop, warm lighting, leave clean central/lower area for text overlay later.
- Never include numbers, Korean/English letters, logos in the scene description outcome.
- readyToGenerate true when imagePrompt is specific enough.`);

function parseJson(raw: string): LayoutAiResult | null {
  const s = raw.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as LayoutAiResult;
  } catch {
    return null;
  }
}

export async function runCouponLayoutAi(opts: {
  message: string;
  storeName?: string;
}): Promise<LayoutAiResult> {
  const prompt = [
    LAYOUT_SYSTEM,
    `Store: ${opts.storeName || '정육점'}`,
    `User request: ${opts.message}`,
  ].join('\n');

  let parsed: LayoutAiResult | null = null;

  if (process.env.GROQ_API_KEY) {
    try {
      const Groq = (await import('groq-sdk')).default;
      const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
      const completion = await groq.chat.completions.create({
        model: 'llama-3.3-70b-versatile',
        temperature: 0.5,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: LAYOUT_SYSTEM },
          { role: 'user', content: prompt },
        ],
      });
      parsed = parseJson(completion.choices[0]?.message?.content || '');
    } catch (e) {
      console.warn('[layout ai] groq', e);
    }
  }

  if (!parsed && (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) {
    try {
      const { GoogleGenerativeAI } = await import('@google/generative-ai');
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '');
      const model = genAI.getGenerativeModel({
        model: 'gemini-2.0-flash',
        generationConfig: { responseMimeType: 'application/json', temperature: 0.5 },
      });
      const result = await model.generateContent(prompt);
      parsed = parseJson(result.response.text());
    } catch (e) {
      console.warn('[layout ai] gemini', e);
    }
  }

  if (!parsed?.imagePrompt) {
    const scene = sanitizeBackgroundPrompt(opts.message);
    return {
      reply: '기본 정육점 프로모 레이아웃으로 생성할게요.',
      name: '기본 프로모',
      imagePrompt: scene || 'Premium Korean butcher shop warm lighting fresh meat display',
      readyToGenerate: true,
    };
  }

  return {
    reply: parsed.reply || '레이아웃 준비됐어요. 생성 버튼을 눌러주세요.',
    name: String(parsed.name || '새 레이아웃').slice(0, 40),
    imagePrompt: String(parsed.imagePrompt).trim(),
    readyToGenerate: parsed.readyToGenerate !== false,
  };
}

export async function generateLayoutBackgroundBuffer(imagePrompt: string): Promise<Buffer> {
  const prompt = buildCouponImagePrompt({
    title: '',
    imagePrompt,
    type: 'percent',
    value: 10,
  });
  const generated = await generateSignageBackgroundImage(prompt, 'portrait');
  return generated.buffer;
}
