import { getKSTTodayYMD } from '@/lib/dateUtils';

/** Pitaya 대상 매장 공통 운영 모델 (정육 소매) */
export const STORE_BUSINESS = {
  industry: '정육 소매점',
  calendar: '365일 무휴 (연중무휴)',
  openHours: '24시간 영업 (매장·POS·무인 결제 가능)',
  staffedHours: '11:00–21:00 KST 유인 매장',
  unmannedHours: '21:00–11:00 KST 무인 매장 (셀프 결제·키오스크·무인 운영)',
  timezone: 'Asia/Seoul (KST)',
} as const;

export type StaffingMode = 'staffed' | 'unmanned';

/** KST 시각(0–23) 기준 유인/무인 구분. 11≤h<21 → 유인 */
export function getStaffingModeKst(hourKst: number): StaffingMode {
  return hourKst >= 11 && hourKst < 21 ? 'staffed' : 'unmanned';
}

export function getCurrentStaffingContext(now = new Date()): {
  dateYmd: string;
  hourKst: number;
  mode: StaffingMode;
  modeLabel: string;
  isHoliday: false;
} {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Seoul',
    hour: 'numeric',
    hour12: false,
  });
  const hourKst = Number(fmt.format(now));
  const mode = getStaffingModeKst(hourKst);
  return {
    dateYmd: getKSTTodayYMD(),
    hourKst,
    mode,
    modeLabel: mode === 'staffed' ? '유인(11–21시)' : '무인(21–11시)',
    isHoliday: false,
  };
}

/** 모든 AI·분석·에이전트 프롬프트에 붙이는 공통 블록 */
export const STORE_BUSINESS_CONTEXT_PROMPT = `【매장 운영 전제 — 모든 분석·의견·조언에 반드시 반영】
- 업종: ${STORE_BUSINESS.industry} (Pitaya OS 대상)
- 영업: ${STORE_BUSINESS.calendar}, ${STORE_BUSINESS.openHours}
- ${STORE_BUSINESS.staffedHours}: 직원 상담·정육·추천·클레임 대응·진열 보강 가능
- ${STORE_BUSINESS.unmannedHours}: 직원 상주 없음 — 셀프 결제·무인 매장. 즉시 대면 서비스·현장 진열 변경·긴급 클레임 대응은 제한
- 휴무일·「일요일/공휴일 매장 쉼」 가정 금지 — 365일 운영
- 요일·시간대 분석: 유인(11–21) vs 무인(21–11) 피크·객단가·품목 mix를 구분해 해석
- 실행 조치: 유인 시간대 → 진열·상담·프로모션·인력 배치 / 무인 시간대 → 키오스크·POP·재고·셀프 구매 동선·자동 알림
- AI 의견·브리핑·예측: 「점심·저녁 유인 피크」「심야·새벽 무인」을 구분하고, 무인 시간대에는 직원 의존 조치를 제안하지 말 것`;

export function appendStoreBusinessContext(prompt: string): string {
  if (prompt.includes('【매장 운영 전제')) return prompt;
  return `${prompt.trim()}\n\n${STORE_BUSINESS_CONTEXT_PROMPT}`;
}

/** 분석 팩·브리핑용 한 줄 컨텍스트 */
export function formatStaffingLine(now = new Date()): string {
  const { hourKst, modeLabel } = getCurrentStaffingContext(now);
  return `현재(KST ${hourKst}시): ${modeLabel} · 365일 무휴 · 24h 영업`;
}

/** 분석 팩·브리핑용 짧은 규칙 (formatPrompt 등) */
export const STORE_BUSINESS_ANALYSIS_RULES = `- 업종: 정육 소매 · 365일 무휴 · 24h 영업
- 11:00–21:00 KST 유인 / 21:00–11:00 KST 무인 — 시간대·요일·조치 제안 시 반드시 구분
- 휴무·「쉬는 날」·「일요일 휴무」 가정 금지
- 무인 시간대에는 직원·대면 상담 의존 조치 제안 금지`;

/** devContext conventions 등에 넣을 key-value */
export const STORE_BUSINESS_CONVENTIONS: Record<string, string> = {
  industry: STORE_BUSINESS.industry,
  operation: `${STORE_BUSINESS.calendar}, ${STORE_BUSINESS.openHours}`,
  staffedHours: STORE_BUSINESS.staffedHours,
  unmannedHours: STORE_BUSINESS.unmannedHours,
  analysisNote: '유인(11–21)·무인(21–11) 시간대 구분 필수, 휴무일 가정 금지',
};
