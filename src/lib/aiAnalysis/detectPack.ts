import type { AnalysisPackId } from './types';

const PACK_META: Record<AnalysisPackId, { label: string; focusHint: string }> = {
  sales_operations: {
    label: '매장 운영 종합',
    focusHint: '365일·24h 정육 소매, 11–21 유인/21–11 무인 시간대를 구분해 매출·객수·품목·고객 흐름을 진단하세요.',
  },
  sales_decline: {
    label: '매출 하락 원인',
    focusHint: '365일·24h 운영 전제. 유인(11–21)·무인(21–11) 시간대별로 하락 원인(유입 vs 객단가 vs mix)을 수치로 특정하고 실행 조치를 제시하세요.',
  },
  customer_retention: {
    label: '고객 이탈·재방문',
    focusHint: '365일 무휴·24h 매장. lost buyers·decreasing·휴면 세그먼트와 유인/무인 시간대별 재방문 패턴을 고려해 쿠폰/알림톡 타깃을 제안하세요.',
  },
  item_mix: {
    label: '품목 mix 변화',
    focusHint: '365일·24h 정육 소매. 유인/무인 시간대별 급감·급증 SKU, 구매 고객 수 변화, 카테고리 mix 이동을 중심으로 분석하세요.',
  },
};

export function detectAnalysisPack(message: string): AnalysisPackId {
  const m = message.toLowerCase();

  if (/품목|mix|sku|메뉴|구성|카테고리/.test(message)) return 'item_mix';
  if (/고객|이탈|휴면|재방문|단골|쿠폰|알림톡|방문감소|방문끊/.test(message)) return 'customer_retention';
  if (/하락|감소|줄었|떨어|원인|왜|부진|침체|어려/.test(message)) return 'sales_decline';

  return 'sales_operations';
}

export function getPackMeta(pack: AnalysisPackId) {
  return PACK_META[pack];
}
