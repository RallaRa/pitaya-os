import { adminDb } from '@/lib/firebase/admin';
import { getKSTTodayYMD, normDateYMD, subtractMonthsYMD } from '@/lib/dateUtils';
import { truncateEvidenceSummary } from '@/lib/salesEvidence';

export interface CustomerVisitSummary {
  thisMonthLabel: string;
  prevMonthLabel: string;
  /** 당월 1일~오늘 방문 고객 수 */
  thisMonthVisitors: number;
  /** 전월 같은 기간(1일~동일일) 방문 고객 수 — 주 비교 */
  prevMonthSamePeriodVisitors: number;
  /** 전월 전체 방문 고객 수 — 보조 표시 */
  prevMonthFullVisitors: number;
  /** @deprecated prevMonthFullVisitors 와 동일 — 하위 호환 */
  prevMonthVisitors: number;
  mtdDayEnd: number;
  mtdPeriodLabel: string;
  visitorChange: number;
  /** 당월 vs 전월 동일기간 객수 증감률 */
  visitorChangePct: number | null;
  thisMonthVisitRate: number | null;
  prevMonthSamePeriodVisitRate: number | null;
  /** 전월 전체 방문률 — 보조 */
  prevMonthVisitRate: number | null;
  visitRateChange: number | null;
  visitRateChangePct: number | null;
  totalCustomers: number;
  thisMonthVisits: number;
  prevMonthSamePeriodVisits: number;
  prevMonthFullVisits: number;
  /** @deprecated prevMonthFullVisits 와 동일 */
  prevMonthVisits: number;
  visitTxChangePct: number | null;
  direction: 'up' | 'down' | 'flat';
  evidenceSummary: string;
  evidenceDetail: string;
  salesHint: string;
}

function monthPrefix(ymd: string): string {
  return ymd.slice(0, 7);
}

function monthLabel(ym: string): string {
  const m = Number(ym.slice(5, 7));
  return `${m}월`;
}

function lastDayOfYm(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const last = new Date(y, m, 0).getDate();
  return `${ym}-${String(last).padStart(2, '0')}`;
}

function pctChange(current: number, previous: number): number | null {
  if (previous <= 0) return null;
  return Math.round(((current - previous) / previous) * 1000) / 10;
}

function countVisitorsInRange(
  salesDocs: { cusCode?: string; date?: string; visitCount?: number }[],
  startYmd: string,
  endYmd: string,
): { visitors: number; visits: number } {
  const codes = new Set<string>();
  let visits = 0;
  for (const r of salesDocs) {
    const d = normDateYMD(String(r.date || ''));
    if (!d || d < startYmd || d > endYmd) continue;
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
  const mtdDayEnd = Number(today.slice(8, 10));
  const mtdPeriodLabel = `1~${mtdDayEnd}일`;

  const thisMonthStart = `${thisYM}-01`;
  const prevMonthStart = `${prevYM}-01`;
  const prevSamePeriodEnd = subtractMonthsYMD(today, 1);
  const prevMonthEnd = lastDayOfYm(prevYM);

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

  const thisMtd = countVisitorsInRange(salesDocs, thisMonthStart, today);
  const prevSame = countVisitorsInRange(salesDocs, prevMonthStart, prevSamePeriodEnd);
  const prevFull = countVisitorsInRange(salesDocs, prevMonthStart, prevMonthEnd);

  const visitorChange = thisMtd.visitors - prevSame.visitors;
  const visitorChangePct = pctChange(thisMtd.visitors, prevSame.visitors);

  const thisMonthVisitRate = totalCustomers > 0
    ? Math.round((thisMtd.visitors / totalCustomers) * 1000) / 10
    : null;
  const prevMonthSamePeriodVisitRate = totalCustomers > 0
    ? Math.round((prevSame.visitors / totalCustomers) * 1000) / 10
    : null;
  const prevMonthVisitRate = totalCustomers > 0
    ? Math.round((prevFull.visitors / totalCustomers) * 1000) / 10
    : null;

  const visitRateChange = thisMonthVisitRate != null && prevMonthSamePeriodVisitRate != null
    ? Math.round((thisMonthVisitRate - prevMonthSamePeriodVisitRate) * 10) / 10
    : null;
  const visitRateChangePct = thisMonthVisitRate != null && prevMonthSamePeriodVisitRate != null && prevMonthSamePeriodVisitRate > 0
    ? Math.round(((thisMonthVisitRate - prevMonthSamePeriodVisitRate) / prevMonthSamePeriodVisitRate) * 1000) / 10
    : null;

  const visitTxChangePct = pctChange(thisMtd.visits, prevSame.visits);

  const primaryChange = visitRateChangePct ?? visitorChangePct ?? 0;
  const direction: CustomerVisitSummary['direction'] =
    primaryChange > 0 ? 'up' : primaryChange < 0 ? 'down' : 'flat';

  const evidenceSummary = truncateEvidenceSummary(
    `POS 방문고객 ${monthLabel(thisYM)} ${mtdPeriodLabel} ${thisMtd.visitors}명 vs ${monthLabel(prevYM)} 동일 ${prevSame.visitors}명·등록 ${totalCustomers}명·pos_customer_sales`,
  );
  const evidenceDetail =
    `기준: pos_customer_sales cusCode 중복 제거(방문고객), visitCount 합(방문횟수). ` +
    `주 비교: ${monthLabel(thisYM)}·${monthLabel(prevYM)} 각 ${mtdPeriodLabel}. ` +
    `보조: ${monthLabel(prevYM)} 전체 ${prevFull.visitors}명.`;
  const salesHint =
    direction === 'down'
      ? '방문·방문률 하락 → 단골 쿠폰·재방문 알림·핵심 품목 전면 진열로 객단가 보완'
      : direction === 'up'
        ? '방문 증가 → 베스트·신상 전면·세트 프로모션으로 구매 전환 강화'
        : '방문 유지 → 단골 VIP·구매 빈도 높은 고객 대상 업셀';

  return {
    thisMonthLabel: monthLabel(thisYM),
    prevMonthLabel: monthLabel(prevYM),
    thisMonthVisitors: thisMtd.visitors,
    prevMonthSamePeriodVisitors: prevSame.visitors,
    prevMonthFullVisitors: prevFull.visitors,
    prevMonthVisitors: prevFull.visitors,
    mtdDayEnd,
    mtdPeriodLabel,
    visitorChange,
    visitorChangePct,
    thisMonthVisitRate,
    prevMonthSamePeriodVisitRate,
    prevMonthVisitRate,
    visitRateChange,
    visitRateChangePct,
    totalCustomers,
    thisMonthVisits: thisMtd.visits,
    prevMonthSamePeriodVisits: prevSame.visits,
    prevMonthFullVisits: prevFull.visits,
    prevMonthVisits: prevFull.visits,
    visitTxChangePct,
    direction,
    evidenceSummary,
    evidenceDetail,
    salesHint,
  };
}
