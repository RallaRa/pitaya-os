import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD, normDateYMD, subtractMonthsYMD } from '@/lib/dateUtils';
import { truncateEvidenceSummary } from '@/lib/salesEvidence';

export interface CustomerVisitSummary {
  thisMonthLabel: string;
  prevMonthLabel: string;
  thisMonthVisitors: number;
  prevMonthVisitors: number;
  visitorChange: number;
  visitorChangePct: number | null;
  thisMonthVisitRate: number | null;
  prevMonthVisitRate: number | null;
  visitRateChange: number | null;
  visitRateChangePct: number | null;
  totalCustomers: number;
  thisMonthVisits: number;
  prevMonthVisits: number;
  visitTxChangePct: number | null;
  direction: 'up' | 'down' | 'flat';
  /** ~100자 근거 요약 (비교 기준·데이터 출처) */
  evidenceSummary: string;
  evidenceDetail: string;
  /** 매출 향상 연결 힌트 */
  salesHint: string;
}

function monthPrefix(ymd: string): string {
  return ymd.slice(0, 7);
}

function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return `${m}월`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function countMonthVisitors(
  salesDocs: { cusCode?: string; date?: string; visitCount?: number }[],
  ym: string,
): { visitors: number; visits: number } {
  const codes = new Set<string>();
  let visits = 0;
  for (const r of salesDocs) {
    const d = normDateYMD(String(r.date || ''));
    if (!d.startsWith(ym)) continue;
    const code = String(r.cusCode || '');
    if (code) codes.add(code);
    visits += Number(r.visitCount || 1);
  }
  return { visitors: codes.size, visits };
}

export async function getCustomerVisitSummary(storeId: string): Promise<CustomerVisitSummary> {
  const today = getKSTTodayYMD();
  const thisYM = monthPrefix(today);
  const prevYM = monthPrefix(subtractMonthsYMD(`${thisYM}-01`, 1));

  const [salesSnap, customerSnap] = await Promise.all([
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
    adminDb.collection('pos_customers').where('storeId', '==', storeId).get(),
  ]);

  const salesDocs = salesSnap.docs.map(d => d.data() as {
    cusCode?: string;
    date?: string;
    visitCount?: number;
  });
  const totalCustomers = customerSnap.size;

  const thisM = countMonthVisitors(salesDocs, thisYM);
  const prevM = countMonthVisitors(salesDocs, prevYM);

  const visitorChange = thisM.visitors - prevM.visitors;
  const visitorChangePct = pctChange(thisM.visitors, prevM.visitors);

  const thisMonthVisitRate = totalCustomers > 0
    ? Math.round((thisM.visitors / totalCustomers) * 1000) / 10
    : null;
  const prevMonthVisitRate = totalCustomers > 0
    ? Math.round((prevM.visitors / totalCustomers) * 1000) / 10
    : null;

  const visitRateChange = thisMonthVisitRate != null && prevMonthVisitRate != null
    ? Math.round((thisMonthVisitRate - prevMonthVisitRate) * 10) / 10
    : null;
  const visitRateChangePct = thisMonthVisitRate != null && prevMonthVisitRate != null && prevMonthVisitRate > 0
    ? Math.round(((thisMonthVisitRate - prevMonthVisitRate) / prevMonthVisitRate) * 1000) / 10
    : null;

  const visitTxChangePct = pctChange(thisM.visits, prevM.visits);

  const primaryChange = visitRateChangePct ?? visitorChangePct ?? 0;
  const direction: CustomerVisitSummary['direction'] =
    primaryChange > 0 ? 'up' : primaryChange < 0 ? 'down' : 'flat';

  const evidenceSummary = truncateEvidenceSummary(
    `POS 방문고객 ${monthLabel(thisYM)} ${thisM.visitors}명 vs ${monthLabel(prevYM)} ${prevM.visitors}명·등록 ${totalCustomers}명 대비 방문률 ${thisMonthVisitRate ?? '-'}%·pos_customer_sales`,
  );
  const evidenceDetail =
    `기준: pos_customer_sales에서 월별 cusCode 중복 제거(방문고객), visitCount 합(방문횟수). ` +
    `방문률 = 월 방문고객 ÷ pos_customers 등록수. ${monthLabel(thisYM)}은 ${today}까지 집계, ${monthLabel(prevYM)}은 전월 전체.`;
  const salesHint =
    direction === 'down'
      ? '방문·방문률 하락 → 단골 쿠폰·재방문 알림·핵심 품목 전면 진열로 객단가 보완'
      : direction === 'up'
        ? '방문 증가 → 베스트·신상 전면·세트 프로모션으로 구매 전환 강화'
        : '방문 유지 → 단골 VIP·구매 빈도 높은 고객 대상 업셀';

  return {
    thisMonthLabel: monthLabel(thisYM),
    prevMonthLabel: monthLabel(prevYM),
    thisMonthVisitors: thisM.visitors,
    prevMonthVisitors: prevM.visitors,
    visitorChange,
    visitorChangePct,
    thisMonthVisitRate,
    prevMonthVisitRate,
    visitRateChange,
    visitRateChangePct,
    totalCustomers,
    thisMonthVisits: thisM.visits,
    prevMonthVisits: prevM.visits,
    visitTxChangePct,
    direction,
    evidenceSummary,
    evidenceDetail,
    salesHint,
  };
}
