import { generateJsonWithFallback } from '@/lib/aiProviderFallback';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { EXPIRY_KEYWORD_RE } from '@/lib/expiryReminder/constants';
import type { ParsedExpiryInput } from '@/lib/expiryReminder/types';

function pad2(n: number) {
  return String(n).padStart(2, '0');
}

/** YYYY-MM-DD 유효성 + 과거 날짜 시 다음 해 보정(연도 생략 시) */
export function normalizeExpiryDateYmd(
  year: number,
  month: number,
  day: number,
): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const today = getKSTTodayYMD();
  const todayYear = Number(today.slice(0, 4));
  let y = year;
  if (y < 100) y += 2000;
  if (!year || year < 100) {
    y = todayYear;
  }
  let candidate = `${y}-${pad2(month)}-${pad2(day)}`;
  if (candidate < today && y === todayYear) {
    candidate = `${todayYear + 1}-${pad2(month)}-${pad2(day)}`;
  }
  const d = new Date(`${candidate}T12:00:00+09:00`);
  if (Number.isNaN(d.getTime())) return null;
  return candidate;
}

/** 규칙 기반 파싱 — 빠른 경로 */
export function parseExpiryByRules(message: string): ParsedExpiryInput | null {
  const text = message.trim();
  if (!EXPIRY_KEYWORD_RE.test(text)) return null;

  const ymdSlash = text.match(
    /(\d{4})[./-](\d{1,2})[./-](\d{1,2})/,
  );
  if (ymdSlash) {
    const date = normalizeExpiryDateYmd(
      Number(ymdSlash[1]),
      Number(ymdSlash[2]),
      Number(ymdSlash[3]),
    );
    if (!date) return null;
    const itemName = text
      .replace(ymdSlash[0], '')
      .replace(EXPIRY_KEYWORD_RE, '')
      .replace(/[:\s]+/g, ' ')
      .trim()
      .slice(0, 80);
    return { itemName: itemName || '품목', expiryDate: date };
  }

  const kr = text.match(
    /(.+?)\s*(?:유통기한|소비기한|유효기한|만료일)\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
  );
  if (kr) {
    const date = normalizeExpiryDateYmd(
      0,
      Number(kr[2]),
      Number(kr[3]),
    );
    if (!date) return null;
    const itemName = kr[1].trim().replace(/^["'[\(]|["'\)\]]$/g, '').slice(0, 80);
    return { itemName: itemName || '품목', expiryDate: date };
  }

  const krShort = text.match(
    /(?:유통기한|소비기한|유효기한|만료일)\s*(\d{1,2})\s*월\s*(\d{1,2})\s*일/,
  );
  if (krShort) {
    const date = normalizeExpiryDateYmd(0, Number(krShort[1]), Number(krShort[2]));
    if (!date) return null;
    const before = text.slice(0, krShort.index).trim();
    const itemName = before.replace(EXPIRY_KEYWORD_RE, '').trim().slice(0, 80);
    return { itemName: itemName || '품목', expiryDate: date };
  }

  return null;
}

const AI_PARSE_SYSTEM = `정육점 유통기한 등록 문장에서 품목명과 만료일만 추출합니다.
반드시 JSON만 반환: {"itemName":"품목명","expiryDate":"YYYY-MM-DD"} 또는 인식 불가 시 {"itemName":null,"expiryDate":null}
- expiryDate는 KST 기준, 연도 없으면 올해·이미 지났으면 내년
- 유통기한/소비기한/유효기한/만료일 관련이 아니면 null`;

export async function parseExpiryByAi(message: string): Promise<ParsedExpiryInput | null> {
  const today = getKSTTodayYMD();
  try {
    const { data } = await generateJsonWithFallback<{ itemName?: string | null; expiryDate?: string | null }>({
      system: AI_PARSE_SYSTEM,
      prompt: `오늘(KST): ${today}\n문장: ${message.slice(0, 500)}`,
      json: true,
      temperature: 0,
      useCase: 'fast',
    });
    const itemName = (data.itemName || '').trim();
    const expiryDate = (data.expiryDate || '').trim();
    if (!itemName || !/^\d{4}-\d{2}-\d{2}$/.test(expiryDate)) return null;
    if (expiryDate < today) return null;
    return { itemName: itemName.slice(0, 80), expiryDate };
  } catch {
    return null;
  }
}

export function looksLikeExpiryMessage(message: string): boolean {
  return EXPIRY_KEYWORD_RE.test(message);
}

export async function parseExpiryMessage(message: string): Promise<ParsedExpiryInput | null> {
  if (!looksLikeExpiryMessage(message)) return null;
  const ruled = parseExpiryByRules(message);
  if (ruled) return ruled;
  return parseExpiryByAi(message);
}
