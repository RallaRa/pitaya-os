import { CHURN_RISK_THRESHOLD } from '@/lib/customerChurnScore';
import type { VisitCycleStatus } from '@/lib/customerVisitCycle';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { d3TargetYmd, isBirthdayOnYmd, parseBirthMonthDay } from '@/lib/birthdayCampaign';

export type MarketingSegment =
  | 'birthday_today'
  | 'birthday_d3'
  | 'churn_risk'
  | 'repurchase_overdue'
  | 'revisit_coupon'
  | 'first_visit_followup'
  | 'visit_declining'
  | 'coupon_remind';

export interface MarketingRecommendationInput {
  cusCode: string;
  name: string;
  phone: string;
  phoneMasked: string;
  birth: string;
  pitayaGrade: string;
  lastVisitDate: string;
  distinctVisitDays: number;
  daysSinceLastVisit: number | null;
  avgCycleDays: number | null;
  cycleStatus: VisitCycleStatus;
  visitTrend: VisitTrendSegment;
  churnScore: number;
  hasRecentRedemption: boolean;
  hasSentCouponJourney: boolean;
  todayYmd?: string;
}

export interface MarketingRecommendation {
  cusCode: string;
  name: string;
  phone: string;
  phoneMasked: string;
  segment: MarketingSegment;
  segmentLabel: string;
  criteria: string;
  couponAction: string;
  messageText: string;
  channel: string;
  priority: number;
  pitayaGrade: string;
  lastVisitDate: string;
  daysSinceLastVisit: number | null;
  churnScore: number;
}

const SEGMENT_META: Record<MarketingSegment, { label: string; channel: string }> = {
  birthday_today: { label: '생일 당일', channel: 'SMS/알림톡' },
  birthday_d3: { label: '생일 D-3', channel: '쿠폰발급+SMS' },
  churn_risk: { label: '이탈 위험', channel: 'SMS/알림톡' },
  repurchase_overdue: { label: '재방문 주기 초과', channel: 'SMS/알림톡' },
  revisit_coupon: { label: '재방문 유도', channel: '쿠폰발급+SMS' },
  first_visit_followup: { label: '첫 구매 감사', channel: 'SMS/알림톡' },
  visit_declining: { label: '방문 감소', channel: 'SMS' },
  coupon_remind: { label: '쿠폰 미사용', channel: 'SMS' },
};

export const MARKETING_INTENT_RE =
  /(쿠폰|마케팅|문자|알림톡|sms|프로모션).{0,20}(추천|리스트|목록|엑셀|정리|발송|뽑|만들)|고객별.{0,12}(쿠폰|마케팅|문자)|회원별.{0,12}(쿠폰|마케팅|문자)|마케팅.{0,12}(대상|세그먼트|타깃)/i;

export function detectMarketingRecommendIntent(message: string): boolean {
  return MARKETING_INTENT_RE.test(String(message || '').trim());
}

export function classifyMarketingRecommendation(
  input: MarketingRecommendationInput,
): MarketingRecommendation | null {
  const todayYmd = input.todayYmd || getKSTTodayYMD();
  const birthMd = parseBirthMonthDay(input.birth);
  const d3Ymd = d3TargetYmd(todayYmd);

  if (birthMd && isBirthdayOnYmd(birthMd, todayYmd)) {
    return buildRow(input, 'birthday_today', 1,
      `생일 당일 (${todayYmd})`,
      '생일 축하 쿠폰 즉시 발급',
      '[Pitaya] 생일을 진심으로 축하드립니다! 오늘 방문 시 생일 특별 혜택을 드립니다.');
  }

  if (birthMd && isBirthdayOnYmd(birthMd, d3Ymd)) {
    return buildRow(input, 'birthday_d3', 2,
      `생일 3일 전 (${d3Ymd})`,
      '생일 D-3 쿠폰 선발급 (birthday 캠페인)',
      '[Pitaya] 곧 생일이시네요! 미리 준비한 생일 쿠폰을 드립니다.');
  }

  if (input.churnScore >= CHURN_RISK_THRESHOLD) {
    const days = input.daysSinceLastVisit ?? '-';
    return buildRow(input, 'churn_risk', 3,
      `이탈 스코어 ${input.churnScore}점 (기준 ${CHURN_RISK_THRESHOLD}), 마지막 방문 ${days}일 전, 추세 ${input.visitTrend}`,
      'STEP3 리텐션 쿠폰 + 이탈 방지 문자',
      '[Pitaya] 오랜만입니다. 특별 혜택을 준비했습니다. 다시 뵙기를 기다립니다.');
  }

  if (
    input.distinctVisitDays >= 2
    && input.avgCycleDays != null
    && input.daysSinceLastVisit != null
    && input.daysSinceLastVisit > input.avgCycleDays + 2
  ) {
    const overdue = input.daysSinceLastVisit - input.avgCycleDays;
    return buildRow(input, 'repurchase_overdue', 4,
      `평균 방문주기 ${input.avgCycleDays}일 대비 ${overdue}일 초과 (상태: ${input.cycleStatus})`,
      '재방문 주기 알림 (repurchase_cycle 큐)',
      '[Pitaya] 평소 방문 주기가 지났습니다. 다시 뵙기를 기다립니다.');
  }

  if (
    input.distinctVisitDays === 1
    && input.daysSinceLastVisit != null
    && input.daysSinceLastVisit >= 14
  ) {
    return buildRow(input, 'revisit_coupon', 5,
      `첫 방문 후 ${input.daysSinceLastVisit}일 경과, 재방문 없음`,
      'STEP2 재방문 쿠폰 발급',
      '[Pitaya] 재방문 쿠폰이 준비되어 있습니다. 매장에서 확인해 주세요.');
  }

  const firstVisitCutoff = addDaysYMD(todayYmd, -3);
  if (
    input.distinctVisitDays === 1
    && input.lastVisitDate >= firstVisitCutoff
  ) {
    return buildRow(input, 'first_visit_followup', 6,
      `첫 구매 후 3일 이내 (${input.lastVisitDate})`,
      'STEP1 첫 구매 감사 문자',
      '[Pitaya] 첫 구매 감사드립니다. 다음 방문을 기다리겠습니다.');
  }

  if (input.visitTrend === 'decreasing' || input.visitTrend === 'churned') {
    return buildRow(input, 'visit_declining', 7,
      `방문 패턴 ${input.visitTrend}, 최근 방문 ${input.daysSinceLastVisit ?? '-'}일 전`,
      '방문 감소 고객 리텐션 문자',
      '[Pitaya] 요즘 뵙지 못해 걱정됐어요. 소중한 고객님께 작은 혜택을 준비했습니다.');
  }

  if (
    input.distinctVisitDays >= 2
    && !input.hasRecentRedemption
    && input.hasSentCouponJourney
  ) {
    return buildRow(input, 'coupon_remind', 8,
      '최근 쿠폰 발송 이력 있으나 미사용',
      '쿠폰 사용 리마인드 문자',
      '[Pitaya] 준비해 드린 쿠폰이 아직 사용되지 않았습니다. 방문 시 꼭 챙겨 가세요.');
  }

  return null;
}

function buildRow(
  input: MarketingRecommendationInput,
  segment: MarketingSegment,
  priority: number,
  criteria: string,
  couponAction: string,
  messageText: string,
): MarketingRecommendation {
  const meta = SEGMENT_META[segment];
  return {
    cusCode: input.cusCode,
    name: input.name,
    phone: input.phone,
    phoneMasked: input.phoneMasked,
    segment,
    segmentLabel: meta.label,
    criteria,
    couponAction,
    messageText,
    channel: meta.channel,
    priority,
    pitayaGrade: input.pitayaGrade,
    lastVisitDate: input.lastVisitDate,
    daysSinceLastVisit: input.daysSinceLastVisit,
    churnScore: input.churnScore,
  };
}

export function summarizeRecommendations(rows: MarketingRecommendation[]): string {
  if (!rows.length) return '현재 발송·쿠폰 추천 대상 고객이 없습니다.';
  const bySegment = new Map<string, number>();
  for (const r of rows) {
    bySegment.set(r.segmentLabel, (bySegment.get(r.segmentLabel) || 0) + 1);
  }
  const lines = [
    `마케팅 추천 대상 **${rows.length}명** (이름·전화번호 포함 엑셀 다운로드 가능)`,
    '',
    '세그먼트별:',
    ...[...bySegment.entries()].map(([k, v]) => `- ${k}: ${v}명`),
    '',
    '아래 「엑셀 다운로드」 버튼으로 전체 리스트를 받을 수 있습니다.',
  ];
  return lines.join('\n');
}
