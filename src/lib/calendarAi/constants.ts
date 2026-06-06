export const HR_CALENDAR_LINK = '/dashboard/hr/calendar';

/** 유통기한 등록과 구분 — 일반 일정 등록 의도 */
export const CALENDAR_INTENT_RE =
  /캘린더(?:에|로)?\s*(?:등록|추가|넣|잡|만들)|일정\s*(?:등록|추가|넣|잡|만들|잡아|넣어)|스케줄\s*(?:등록|추가|잡)|(?:등록|추가|잡아)\s*줘|일정\s*잡/;

export const CALENDAR_DATE_HINT_RE =
  /\d{4}[./-]\d{1,2}[./-]\d{1,2}|\d{1,2}\s*월\s*\d{1,2}\s*일|오늘|내일|모레|글피|다음\s*주|차\s*주|[월화수목금토일]요일/;

/** 사용법 문의 — 자동 등록 제외 */
export const CALENDAR_HOWTO_RE =
  /어떻게\s*(?:등록|추가|넣)|등록\s*방법|사용\s*방법|어디서\s*(?:등록|추가)|(?:알려|가르쳐|설명)\s*줘/;
