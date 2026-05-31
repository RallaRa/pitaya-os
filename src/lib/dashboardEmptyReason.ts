/** 대시보드 위젯 — 값 미표시 시 사용자용 사유 문구 */

export function buildSalesPredictionEmptyReason(opts: {
  storeId: string;
  salesReportDays: number;
  hasAi: boolean;
}): string {
  if (!opts.storeId) {
    return '매장이 선택되지 않았습니다. 상단에서 매장을 선택해 주세요.';
  }
  if (opts.salesReportDays === 0) {
    return '최근 90일 daily_reports에 품목(items) 데이터가 없습니다. POS 브릿지 동기화 또는 일마감 입력 후 예측이 시작됩니다.';
  }
  if (!opts.hasAi) {
    return '판매 이력은 있으나 AI API 키가 없어 통계 기반만 표시됩니다. .env에 AI 키를 설정하면 분석 의견이 생성됩니다.';
  }
  return '예측 데이터를 생성할 수 없습니다. 새로고침을 시도해 주세요.';
}

export function buildTodaySalesEmptyReason(opts: {
  hasTodayDoc: boolean;
  hasYesterdayDoc: boolean;
  todayTotal: number;
  isClosed: boolean;
}): string | null {
  if (!opts.hasTodayDoc && !opts.hasYesterdayDoc) {
    return '오늘·어제 pos_daily_sales / daily_reports 문서가 없습니다. POS 브릿지가 동기화 중인지, 일마감이 입력됐는지 확인하세요.';
  }
  if (!opts.hasTodayDoc) {
    return '오늘 매출 문서가 없습니다. 영업 중이면 POS 동기화를 기다리거나, 일마감을 입력하세요.';
  }
  if (opts.todayTotal === 0 && !opts.isClosed) {
    return '문서는 있으나 매출이 0원으로 기록됐습니다. pos_bridge의 headers·totalSales 필드 또는 마감 전 스냅샷 여부를 확인하세요.';
  }
  return null;
}

export function buildWeeklyEmptyReason(opts: {
  storeId: string;
  itemCount: number;
}): string | null {
  if (!opts.storeId) return '매장이 선택되지 않았습니다.';
  if (opts.itemCount === 0) {
    return '최근 7일 daily_reports.items 또는 pos_sales_detail에 품목 데이터가 없습니다. POS 연동·일마감 품목 저장을 확인하세요.';
  }
  return null;
}

export function buildYesterdayEmptyReason(): string {
  return '어제(또는 오늘) daily_reports에 items 배열이 비어 있습니다. 전일 분석은 일마감 품목 데이터만 사용합니다.';
}

export function buildSalesCompareEmptyReason(opts: {
  weekCurrentNet: number;
  weekPrevNet: number;
  monthCurrentNet: number;
}): string | null {
  if (opts.weekCurrentNet === 0 && opts.weekPrevNet === 0 && opts.monthCurrentNet === 0) {
    return '주·월 비교 기간에 daily_reports 또는 pos_daily_sales 매출이 없습니다. POS 동기화 후 1일 이상 데이터가 쌓여야 비교됩니다.';
  }
  if (opts.weekPrevNet === 0) {
    return '지난 주 매출이 0원이라 주간 증감률을 계산할 수 없습니다. (이번 주 금액은 표시됨)';
  }
  return null;
}
