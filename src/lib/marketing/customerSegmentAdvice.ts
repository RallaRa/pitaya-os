import type { VisitCycleStatus } from '@/lib/customerVisitCycle';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';
import type { MarketingSegment } from '@/lib/marketing/couponRecommendation';

export type CustomerAdviceSegment =
  | 'due_soon'
  | 'overdue'
  | 'churned'
  | 'increasing'
  | 'decreasing';

export const CUSTOMER_ADVICE_SEGMENT_LABELS: Record<CustomerAdviceSegment, string> = {
  due_soon: '재방문 임박',
  overdue: '이탈 위험',
  churned: '방문 끊김',
  increasing: '방문 증가',
  decreasing: '방문 감소',
};

export const CUSTOMER_ADVICE_SEGMENTS: CustomerAdviceSegment[] = [
  'due_soon',
  'overdue',
  'churned',
  'increasing',
  'decreasing',
];

export function isCustomerAdviceSegment(v: string): v is CustomerAdviceSegment {
  return CUSTOMER_ADVICE_SEGMENTS.includes(v as CustomerAdviceSegment);
}

export function customerMatchesAdviceSegment(
  segment: CustomerAdviceSegment,
  cycleStatus: VisitCycleStatus,
  visitTrend: VisitTrendSegment,
  marketingSegment: MarketingSegment | null,
): boolean {
  switch (segment) {
    case 'due_soon':
      return cycleStatus === 'due_soon';
    case 'overdue':
      return cycleStatus === 'overdue'
        || marketingSegment === 'churn_risk'
        || marketingSegment === 'repurchase_overdue';
    case 'churned':
      return visitTrend === 'churned';
    case 'increasing':
      return visitTrend === 'increasing';
    case 'decreasing':
      return visitTrend === 'decreasing'
        || marketingSegment === 'visit_declining';
    default:
      return false;
  }
}

export interface SegmentBaselineAdvice {
  couponStrategy: string;
  messageTone: string;
  actions: string[];
  sampleMessage: string;
  timing: string;
  cautions: string[];
}

const BASELINE: Record<CustomerAdviceSegment, SegmentBaselineAdvice> = {
  due_soon: {
    couponStrategy: '소액 재방문 쿠폰(5~10%) 또는 단골 감사 포인트 적립 안내',
    messageTone: '부담 없이 다가가는 리마인드 톤',
    actions: [
      '평소 방문 주기 임박 고객에게 재방문 리마인드 문자 발송',
      '자주 구매 품목 기반 소액 쿠폰 제안',
      '방문 예정일 전후 2일 내 1회만 발송',
    ],
    sampleMessage: '[Pitaya] 평소 방문 주기가 다가왔어요. 오늘 준비해 둔 신선한 상품으로 뵙겠습니다.',
    timing: '예상 재방문일 1~2일 전, 오전 10시 또는 오후 5시',
    cautions: ['단기간 중복 발송 금지', '쿠폰 미사용 고객은 혜택 강도를 낮춤'],
  },
  overdue: {
    couponStrategy: 'STEP3 리텐션 쿠폰(10~15%) + 한정 기간 유효',
    messageTone: '그리움·특별 혜택 강조, 압박감은 낮게',
    actions: [
      '이탈 스코어 70점 이상 고객 우선 발송',
      '재방문 주기 초과 고객에게 맞춤 혜택 문자',
      '쿠폰 발급 후 7일 내 미방문 시 1회 리마인드',
    ],
    sampleMessage: '[Pitaya] 오랜만입니다. 특별 혜택을 준비했습니다. 다시 뵙기를 기다립니다.',
    timing: '마지막 방문 후 평균 주기 +3일, 주 1회 배치 발송',
    cautions: ['과도한 할인은 객단가 하락 유발', 'VIP 등급은 별도 메시지 톤 사용'],
  },
  churned: {
    couponStrategy: '복귀 전용 쿠폰(15% 또는 1만원 이상 할인) + 유효기간 14일',
    messageTone: '오랜만에 연락하는 정성·신뢰 강조',
    actions: [
      '60일+ 미방문 고객 복귀 캠페인 문자',
      '과거 구매 품목 언급으로 개인화',
      '2차 미반응 시 30일 후 재시도 1회',
    ],
    sampleMessage: '[Pitaya] 요즘 뵙지 못해 걱정됐어요. 복귀 고객님께 드리는 특별 혜택을 확인해 주세요.',
    timing: '주 1회, 화·목 오전 (대량 발송 분산)',
    cautions: ['장기 미방문 고객에게 과한 할인 지양', '수신 거부 고객 제외'],
  },
  increasing: {
    couponStrategy: '감사 메시지 중심, 소액 VIP 업그레이드·적립 보너스',
    messageTone: '칭찬·감사·단골 인정',
    actions: [
      '방문 증가 고객에게 감사 문자 및 등급 혜택 안내',
      '자주 구매 품목 번들·세트 제안',
      '추천인·리뷰 참여 유도(선택)',
    ],
    sampleMessage: '[Pitaya] 요즘 자주 뵙게 되어 감사합니다. 단골 고객님께 작은 혜택을 드립니다.',
    timing: '월 1회, 방문 증가 확인 후 발송',
    cautions: ['할인보다 관계 강화에 초점', '과도한 프로모션은 방문 패턴 왜곡 가능'],
  },
  decreasing: {
    couponStrategy: 'STEP2 재방문 쿠폰 또는 관심 품목 할인',
    messageTone: '걱정·배려 + 가벼운 혜택',
    actions: [
      '방문 간격이 늘어난 고객에게 재방문 유도 문자',
      '최근 미구매 인기 품목 안내',
      '쿠폰 미사용 시 리마인드 1회',
    ],
    sampleMessage: '[Pitaya] 요즘 바쁘신가요? 준비해 드린 재방문 쿠폰이 있습니다.',
    timing: '방문 감소 감지 후 7일 이내, 1회 발송',
    cautions: ['연속 발송 자제', '이탈 위험으로 전환 시 overdue 전략으로 승격'],
  },
};

export function getBaselineSegmentAdvice(segment: CustomerAdviceSegment): SegmentBaselineAdvice {
  return BASELINE[segment];
}

export interface SegmentAdviceAiResult {
  summary: string;
  couponStrategy: string;
  messageTone: string;
  actions: string[];
  sampleMessage: string;
  timing: string;
  cautions: string[];
  provider?: string;
  generatedAt: string;
}

export function parseSegmentAdviceJson(raw: string): SegmentAdviceAiResult | null {
  try {
    const cleaned = raw.replace(/```json\s*/gi, '').replace(/```/g, '').trim();
    const parsed = JSON.parse(cleaned) as Partial<SegmentAdviceAiResult>;
    if (!parsed.summary) return null;
    return {
      summary: String(parsed.summary),
      couponStrategy: String(parsed.couponStrategy || ''),
      messageTone: String(parsed.messageTone || ''),
      actions: Array.isArray(parsed.actions) ? parsed.actions.map(String) : [],
      sampleMessage: String(parsed.sampleMessage || ''),
      timing: String(parsed.timing || ''),
      cautions: Array.isArray(parsed.cautions) ? parsed.cautions.map(String) : [],
      generatedAt: new Date().toISOString(),
    };
  } catch {
    return null;
  }
}

export function baselineToAdviceResult(
  segment: CustomerAdviceSegment,
  generatedAt: string,
): SegmentAdviceAiResult {
  const b = getBaselineSegmentAdvice(segment);
  return {
    summary: `${CUSTOMER_ADVICE_SEGMENT_LABELS[segment]} 고객에게는 ${b.couponStrategy}`,
    ...b,
    generatedAt,
  };
}
