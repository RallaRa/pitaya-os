/**
 * 매출·품목 지표 계산 규칙 (AI 예측·근거 공통)
 * — 지표별 분모 혼동 방지
 */

/** AI·통계 프롬프트용 */
export const SALES_METRIC_RULES_PROMPT = `
[지표 계산 규칙 — 반드시 구분]
1) 품목 일평균매출: 누적매출 ÷ 판매발생 일수 (분모=날짜/일수, 분자=매출). 품목 예측 expectedSales·dailyAvgSales는 이 값만 사용.
2) 객단가(1인당): 순매출 ÷ 객수 (분모=객수, 분자=매출). 매장 일마감·목표 비교용. 품목 일평균매출에 객수로 나누지 말 것.
3) 건당평균매출: 순매출 ÷ 건수 (분모=건수, 분자=매출). POS 묶음결제 시 건수 왜곡 가능. 품목 일평균매출과 혼동 금지.
`.trim();

export function formatItemDailyAvgReason(amount: number, salesDays: number, dailyAvg: number, sharePct?: number): string {
  const share = sharePct != null ? ` (비중 ${sharePct}%)` : '';
  return `[90일 일평균매출] ${amount.toLocaleString()}원 ÷ ${salesDays}일 = ${dailyAvg.toLocaleString()}원${share}`;
}

export function formatItemDailyAvgShort(dailyAvg: number): string {
  return `${dailyAvg.toLocaleString()}원`;
}
