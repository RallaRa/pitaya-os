import Groq from 'groq-sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import {
  EMPTY_COUPON_DRAFT,
  sanitizeCouponCode,
  type CouponAiChatResult,
  type CouponDraft,
} from './types';

const SYSTEM = `You help Korean butcher shop (정육점) staff design digital coupons.
Always respond with ONLY valid JSON (no markdown):
{
  "reply": "한국어 대화 응답 — 친절하고 짧게",
  "draft": {
    "code": "영문 대문자 코드 6~12자",
    "title": "한국어 쿠폰 제목",
    "description": "한국어 설명 1~2문장",
    "type": "percent" | "fixed",
    "value": number,
    "minAmount": number,
    "maxDiscount": number,
    "maxUse": number,
    "startDate": "YYYY-MM-DD or empty string",
    "endDate": "YYYY-MM-DD or empty string",
    "imagePrompt": "English visual scene for coupon background, no text in image"
  },
  "readyToPublish": boolean
}
Rules:
- Infer dates from phrases like "이번 주말", "6월까지" using today's context in user message when possible.
- code must be unique-looking (e.g. HANWOO10, SUMMER25).
- readyToPublish true when code, type, value, title are clear.
- imagePrompt: appetizing meat shop scene matching the promotion.`;

function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseJsonBlock(raw: string): CouponAiChatResult | null {
  const trimmed = raw.trim();
  const start = trimmed.indexOf('{');
  const end = trimmed.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(trimmed.slice(start, end + 1)) as CouponAiChatResult;
  } catch {
    return null;
  }
}

function normalizeDraft(partial: Partial<CouponDraft> | undefined, prev: CouponDraft): CouponDraft {
  const d = partial || {};
  return {
    code: sanitizeCouponCode(d.code || prev.code) || prev.code,
    title: String(d.title ?? prev.title).trim(),
    description: String(d.description ?? prev.description).trim(),
    type: d.type === 'fixed' ? 'fixed' : d.type === 'percent' ? 'percent' : prev.type,
    value: Number.isFinite(Number(d.value)) ? Number(d.value) : prev.value,
    minAmount: Number.isFinite(Number(d.minAmount)) ? Number(d.minAmount) : prev.minAmount,
    maxDiscount: Number.isFinite(Number(d.maxDiscount)) ? Number(d.maxDiscount) : prev.maxDiscount,
    maxUse: Number.isFinite(Number(d.maxUse)) ? Number(d.maxUse) : prev.maxUse,
    startDate: String(d.startDate ?? prev.startDate).trim(),
    endDate: String(d.endDate ?? prev.endDate).trim(),
    imagePrompt: String(d.imagePrompt ?? prev.imagePrompt).trim(),
  };
}

function fallbackReply(message: string, draft: CouponDraft): CouponAiChatResult {
  const lower = message.toLowerCase();
  const next = { ...draft };

  const pct = message.match(/(\d+)\s*%/);
  const won = message.match(/(\d[\d,]*)\s*원/);
  if (pct) {
    next.type = 'percent';
    next.value = Number(pct[1]);
  } else if (won) {
    next.type = 'fixed';
    next.value = Number(won[1].replace(/,/g, ''));
  }

  if (/한우|등심|갈비|특가|세일/.test(message) && !next.title) {
    next.title = message.slice(0, 30);
  }
  if (!next.code && next.value) {
    next.code = sanitizeCouponCode(`SALE${next.value}`);
  }
  if (!next.imagePrompt && next.title) {
    next.imagePrompt = `Fresh premium Korean beef promotion, warm butcher shop lighting, ${next.title}`;
  }

  return {
    reply: lower.includes('발행') || lower.includes('만들')
      ? '초안을 채웠어요. 미리보기에서 이미지 생성 후 발행해 주세요.'
      : '할인율·기간·대상 품목을 알려주시면 쿠폰 초안을 완성할게요.',
    draft: next,
    readyToPublish: !!(next.code && next.title && next.value > 0),
  };
}

async function callGroq(
  message: string,
  history: { role: string; content: string }[],
  currentDraft: CouponDraft,
  storeName: string,
): Promise<CouponAiChatResult | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const userContext = [
    `Today (KST): ${todayKST()}`,
    `Store: ${storeName || '정육점'}`,
    `Current draft JSON: ${JSON.stringify(currentDraft)}`,
    `User: ${message}`,
  ].join('\n');

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.4,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: SYSTEM },
      ...history.slice(-8).map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userContext },
    ],
  });

  const text = completion.choices[0]?.message?.content || '';
  return parseJsonBlock(text);
}

async function callGemini(
  message: string,
  history: { role: string; content: string }[],
  currentDraft: CouponDraft,
  storeName: string,
): Promise<CouponAiChatResult | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.4 },
  });

  const prompt = [
    SYSTEM,
    `Today (KST): ${todayKST()}`,
    `Store: ${storeName}`,
    `Current draft: ${JSON.stringify(currentDraft)}`,
    'Conversation:',
    ...history.slice(-8).map(m => `${m.role}: ${m.content}`),
    `user: ${message}`,
  ].join('\n');

  const result = await model.generateContent(prompt);
  return parseJsonBlock(result.response.text());
}

export async function runCouponAiChat(opts: {
  message: string;
  history?: { role: string; content: string }[];
  currentDraft?: Partial<CouponDraft>;
  storeName?: string;
}): Promise<CouponAiChatResult> {
  const prev = normalizeDraft(opts.currentDraft, EMPTY_COUPON_DRAFT);
  const history = opts.history || [];

  let parsed: CouponAiChatResult | null = null;
  try {
    parsed = await callGroq(opts.message, history, prev, opts.storeName || '');
  } catch (e) {
    console.warn('[coupon ai] groq failed', e);
  }
  if (!parsed) {
    try {
      parsed = await callGemini(opts.message, history, prev, opts.storeName || '');
    } catch (e) {
      console.warn('[coupon ai] gemini failed', e);
    }
  }

  if (!parsed?.reply) {
    return fallbackReply(opts.message, prev);
  }

  return {
    reply: parsed.reply,
    draft: normalizeDraft(parsed.draft, prev),
    readyToPublish: !!parsed.readyToPublish,
  };
}
