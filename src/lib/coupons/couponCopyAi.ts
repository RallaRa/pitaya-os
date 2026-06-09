import {
  EMPTY_COUPON_COPY,
  sanitizeCouponCode,
  type CouponCopyChatResult,
  type CouponCopyItem,
} from './types';
import { appendStoreBusinessContext } from '@/lib/storeBusinessContext';

const COPY_SYSTEM = appendStoreBusinessContext(`You write COUPON COPY ONLY for a Korean butcher shop (정육점).
Do NOT describe images or layouts — text for coupon card + POS fields only.
Respond ONLY with valid JSON:
{
  "reply": "한국어 대화 응답",
  "draft": {
    "code": "CODE",
    "title": "쿠폰 제목",
    "description": "설명",
    "type": "percent"|"fixed",
    "value": number,
    "minAmount": number,
    "maxDiscount": number,
    "maxUse": number,
    "startDate": "YYYY-MM-DD or empty",
    "endDate": "YYYY-MM-DD or empty",
    "bodyLines": ["카드에 표시할 문구 줄들"]
  },
  "extraCoupons": [],
  "readyToPublish": boolean
}
Rules:
- bodyLines: short lines shown ON the coupon image (e.g. "2만원 구매 시 2,000원 할인", "5만원 구매 시 5,000원 할인").
- If user describes tiered discounts on ONE card, put ALL tiers in bodyLines of draft; minAmount/value = primary tier for POS.
- If user wants SEPARATE coupons per tier, fill extraCoupons[] each with own code, minAmount, value, bodyLines (1 line each).
- Infer dates from "이번 주말", "6월까지" etc.
- Never output imagePrompt or visual descriptions.`);

function todayKST(): string {
  return new Date(Date.now() + 9 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function parseJson(raw: string): CouponCopyChatResult | null {
  const s = raw.trim();
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(s.slice(start, end + 1)) as CouponCopyChatResult;
  } catch {
    return null;
  }
}

function normalizeCopyItem(partial: Partial<CouponCopyItem> | undefined, prev: CouponCopyItem): CouponCopyItem {
  const d = partial || {};
  const bodyLines = Array.isArray(d.bodyLines)
    ? d.bodyLines.map(l => String(l).trim()).filter(Boolean).slice(0, 8)
    : prev.bodyLines;
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
    bodyLines: bodyLines.length ? bodyLines : prev.bodyLines,
  };
}

function fallbackCopy(message: string, prev: CouponCopyItem): CouponCopyChatResult {
  const next = { ...prev };
  const bodyLines: string[] = [];

  const tierMatches = [...message.matchAll(/(\d[\d,]*)\s*만?\s*원?\s*(?:이상\s*)?(?:구매\s*)?(?:시|면)\s*(\d[\d,]*)\s*(?:천|만)?\s*원?\s*할인/gi)];
  for (const m of tierMatches) {
    const min = m[1].replace(/,/g, '');
    const disc = m[2].replace(/,/g, '');
    const minWon = min.length <= 2 ? Number(min) * 10000 : Number(min);
    let discWon = Number(disc);
    if (/천/.test(m[0]) && discWon < 1000) discWon *= 1000;
    if (/만/.test(m[0]) && discWon < 10000) discWon *= 10000;
    bodyLines.push(`${minWon.toLocaleString('ko-KR')}원 구매 시 ${discWon.toLocaleString('ko-KR')}원 할인`);
  }

  if (bodyLines.length) {
    next.bodyLines = bodyLines;
    next.type = 'fixed';
    next.value = Number(bodyLines[0].match(/(\d[\d,]+)원 할인/)?.[1]?.replace(/,/g, '') || 0);
    const minMatch = bodyLines[0].match(/^([\d,]+)원/);
    if (minMatch) next.minAmount = Number(minMatch[1].replace(/,/g, ''));
    if (!next.title) next.title = '구간 할인 쿠폰';
    if (!next.code) next.code = sanitizeCouponCode('TIER' + next.minAmount);
  }

  return {
    reply: bodyLines.length
      ? '구간 할인 문구를 카드에 넣을게요. 레이아웃 선택 후 미리보기·발행하세요.'
      : '할인 조건·기간·코드를 알려주세요. (이미지는 레이아웃에서 선택)',
    draft: next,
    extraCoupons: [],
    readyToPublish: !!(next.code && next.title && (next.value > 0 || next.bodyLines.length)),
  };
}

async function callGroq(
  message: string,
  history: { role: string; content: string }[],
  current: CouponCopyItem,
  storeName: string,
): Promise<CouponCopyChatResult | null> {
  if (!process.env.GROQ_API_KEY) return null;
  const Groq = (await import('groq-sdk')).default;
  const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });
  const userContext = [
    `Today (KST): ${todayKST()}`,
    `Store: ${storeName}`,
    `Current copy JSON: ${JSON.stringify(current)}`,
    `User: ${message}`,
  ].join('\n');

  const completion = await groq.chat.completions.create({
    model: 'llama-3.3-70b-versatile',
    temperature: 0.35,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: COPY_SYSTEM },
      ...history.slice(-8).map(m => ({
        role: (m.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
        content: m.content,
      })),
      { role: 'user', content: userContext },
    ],
  });
  return parseJson(completion.choices[0]?.message?.content || '');
}

async function callGemini(
  message: string,
  history: { role: string; content: string }[],
  current: CouponCopyItem,
  storeName: string,
): Promise<CouponCopyChatResult | null> {
  const key = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (!key) return null;
  const { GoogleGenerativeAI } = await import('@google/generative-ai');
  const genAI = new GoogleGenerativeAI(key);
  const model = genAI.getGenerativeModel({
    model: 'gemini-2.0-flash',
    generationConfig: { responseMimeType: 'application/json', temperature: 0.35 },
  });
  const prompt = [
    COPY_SYSTEM,
    `Today: ${todayKST()}`,
    `Store: ${storeName}`,
    `Current: ${JSON.stringify(current)}`,
    ...history.slice(-8).map(m => `${m.role}: ${m.content}`),
    `user: ${message}`,
  ].join('\n');
  const result = await model.generateContent(prompt);
  return parseJson(result.response.text());
}

export async function runCouponCopyAi(opts: {
  message: string;
  history?: { role: string; content: string }[];
  currentDraft?: Partial<CouponCopyItem>;
  storeName?: string;
}): Promise<CouponCopyChatResult> {
  const prev = normalizeCopyItem(opts.currentDraft, EMPTY_COUPON_COPY);
  const history = opts.history || [];

  let parsed: CouponCopyChatResult | null = null;
  try {
    parsed = await callGroq(opts.message, history, prev, opts.storeName || '');
  } catch (e) {
    console.warn('[coupon copy ai] groq', e);
  }
  if (!parsed) {
    try {
      parsed = await callGemini(opts.message, history, prev, opts.storeName || '');
    } catch (e) {
      console.warn('[coupon copy ai] gemini', e);
    }
  }

  if (!parsed?.reply) return fallbackCopy(opts.message, prev);

  const draft = normalizeCopyItem(parsed.draft, prev);
  const extraCoupons = Array.isArray(parsed.extraCoupons)
    ? parsed.extraCoupons.map(c => normalizeCopyItem(c, EMPTY_COUPON_COPY)).filter(c => c.code)
    : [];

  return {
    reply: parsed.reply,
    draft,
    extraCoupons,
    readyToPublish: !!parsed.readyToPublish && !!(draft.code && (draft.value > 0 || draft.bodyLines.length)),
  };
}
