/**
 * AI 종합 분석 등 — 전주/전월/전년 동요일·동일일 뒤에 (YYYY-MM-DD (요일)) 표기
 */
import { addDaysYMD, getWeekdayKo, subtractMonthsYMD } from '@/lib/dateUtils';
import { getCompareDates } from '@/lib/reportCompare';

function formatDateParen(ymd: string): string {
  const dow = getWeekdayKo(ymd);
  return dow ? ` (${ymd} (${dow}))` : ` (${ymd})`;
}

/** 이미 날짜 괄호가 붙어 있으면 중복 방지 */
const ALREADY_ANNOTATED = /\(\d{4}-\d{2}-\d{2}\s*\(/;

type TermRule = { pattern: RegExp; ymd: string };

function buildTermRules(baseYmd: string): TermRule[] {
  const d = getCompareDates(baseYmd);
  return [
    { pattern: /전년\s*동월\s*동요일|전년동월동요일/g, ymd: d.lastYearMonthDow },
    { pattern: /전년\s*동월\s*동일(?:일)?|전년동월동일/g, ymd: d.lastYearMonthSame },
    { pattern: /전년\s*동요일|전년동요일/g, ymd: d.lastYearMonthDow },
    { pattern: /전년\s*동일(?:일)?|전년동일/g, ymd: d.lastYearMonthSame },
    { pattern: /전전전월\s*동일(?:일)?|전전전월동일/g, ymd: subtractMonthsYMD(baseYmd, 3) },
    { pattern: /전전월\s*동일(?:일)?|전전월동일/g, ymd: subtractMonthsYMD(baseYmd, 2) },
    { pattern: /전월\s*동요일|전월동요일/g, ymd: d.lastMonthDow },
    { pattern: /전월\s*동일(?:일)?|전월동일/g, ymd: d.lastMonthSame },
    { pattern: /전주\s*동(?:일|요)일|전주동(?:일|요)일/g, ymd: d.lastWeekDow },
    { pattern: /전일/g, ymd: d.yesterday },
  ];
}

export function annotateCompareDatesInComment(text: string, baseYmd: string): string {
  if (!text?.trim() || !baseYmd) return text;

  let out = text;
  for (const { pattern, ymd } of buildTermRules(baseYmd)) {
    const tag = formatDateParen(ymd);
    out = out.replace(pattern, (match, offset, full) => {
      const after = full.slice(offset + match.length, offset + match.length + 24);
      if (ALREADY_ANNOTATED.test(after)) return match;
      return match + tag;
    });
  }
  return out;
}
