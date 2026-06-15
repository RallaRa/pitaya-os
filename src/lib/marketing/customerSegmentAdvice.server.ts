import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';
import {
  buildVisitDatesFromSales,
  computeChurnScore,
  groupSalesByCustomer,
  type SalesRowLite,
} from '@/lib/customerChurnScore';
import { computeVisitTrend } from '@/lib/customerVisitTrend';
import { mergeVisitCycle, computeVisitCycle } from '@/lib/customerVisitCycle';
import {
  classifyMarketingRecommendation,
  type MarketingSegment,
} from '@/lib/marketing/couponRecommendation';
import {
  CUSTOMER_ADVICE_SEGMENT_LABELS,
  customerMatchesAdviceSegment,
  type CustomerAdviceSegment,
} from '@/lib/marketing/customerSegmentAdvice';

export interface SegmentMarketingContext {
  segment: CustomerAdviceSegment;
  segmentLabel: string;
  count: number;
  avgChurnScore: number | null;
  avgDaysSinceLastVisit: number | null;
  avgCycleDays: number | null;
  marketingBreakdown: Record<string, number>;
  couponActions: string[];
  sampleMessages: string[];
  gradeBreakdown: Record<string, number>;
}

async function fetchAllCustomerDocs(storeId: string) {
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (true) {
    let q = adminDb.collection('pos_customers').where('storeId', '==', storeId).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

function buildRedemptionSet(logs: QueryDocumentSnapshot[], sinceYmd: string): Set<string> {
  const set = new Set<string>();
  for (const doc of logs) {
    const r = doc.data();
    const code = String(r.customerCusCode || '').trim();
    if (!code) continue;
    const created = r.createdAt?.toDate?.() as Date | undefined;
    const ymd = created ? normDateYMD(created.toISOString().slice(0, 10)) : '';
    if (ymd && ymd >= sinceYmd) set.add(code);
  }
  return set;
}

function buildSentCouponJourneySet(queueDocs: QueryDocumentSnapshot[], sinceYmd: string): Set<string> {
  const set = new Set<string>();
  for (const doc of queueDocs) {
    const r = doc.data();
    const step = String(r.journeyStep || '');
    if (step !== 'STEP2' && step !== 'STEP3') continue;
    const status = String(r.status || '');
    if (status !== 'sent' && status !== 'pending') continue;
    const code = String(r.customerId || '').trim();
    if (!code) continue;
    const sched = r.scheduledAt?.toDate?.() as Date | undefined;
    const created = r.createdAt?.toDate?.() as Date | undefined;
    const refDate = sched || created;
    const ymd = refDate ? normDateYMD(refDate.toISOString().slice(0, 10)) : '';
    if (!ymd || ymd < sinceYmd) continue;
    set.add(code);
  }
  return set;
}

export async function buildSegmentMarketingContext(
  storeId: string,
  segment: CustomerAdviceSegment,
): Promise<SegmentMarketingContext> {
  const todayYmd = getKSTTodayYMD();
  const redemptionSince = addDaysYMD(todayYmd, -90);
  const activeSince = addDaysYMD(todayYmd, -365);

  const [customerDocs, salesSnap, redemptionSnap, queueSnap] = await Promise.all([
    fetchAllCustomerDocs(storeId),
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
    adminDb.collection('coupon_redemption_logs').where('storeId', '==', storeId).limit(5000).get(),
    adminDb.collection('notification_queue').where('storeId', '==', storeId).limit(5000).get(),
  ]);

  const salesDocs = salesSnap.docs.map(d => d.data() as SalesRowLite);
  const salesByCode = groupSalesByCustomer(salesDocs);
  const visitDatesMap = buildVisitDatesFromSales(salesDocs);
  const recentRedemptions = buildRedemptionSet(redemptionSnap.docs, redemptionSince);
  const sentCouponJourneys = buildSentCouponJourneySet(queueSnap.docs, redemptionSince);

  let count = 0;
  let churnSum = 0;
  let daysSum = 0;
  let daysCount = 0;
  let cycleSum = 0;
  let cycleCount = 0;
  const marketingBreakdown: Record<string, number> = {};
  const couponActionSet = new Set<string>();
  const sampleMessages: string[] = [];
  const gradeBreakdown: Record<string, number> = {};

  for (const doc of customerDocs) {
    const r = doc.data();
    const cusCode = String(r.cusCode || '').trim();
    if (!cusCode) continue;

    const lastVisit = normDateYMD(String(r.lastVisitDate || ''));
    if (lastVisit && lastVisit < activeSince) continue;

    const visitDates = visitDatesMap.get(cusCode) || [];
    const salesRows = salesByCode.get(cusCode) || [];
    const joinDate = normDateYMD(String(r.joinDate || r.writeDate || ''));
    const churn = computeChurnScore({
      visitDates,
      salesRows,
      fallbackVisitCount: Number(r.distinctVisitDays || r.totalVisits || 0),
      joinDate,
      lastVisitDate: lastVisit,
      hasRecentRedemption: recentRedemptions.has(cusCode),
      hasSentCouponJourney: sentCouponJourneys.has(cusCode),
      todayYmd,
    });
    const cycle = mergeVisitCycle(
      computeVisitCycle(visitDates, todayYmd),
      Number(r.distinctVisitDays || r.totalVisits || 0),
      joinDate,
      lastVisit,
    );
    const trend = computeVisitTrend(visitDates, todayYmd);

    const rec = classifyMarketingRecommendation({
      cusCode,
      name: String(r.nameMasked || '고객'),
      phone: '',
      phoneMasked: String(r.phoneMasked || ''),
      birth: '',
      pitayaGrade: String(r.pitayaGrade || r.grade || ''),
      lastVisitDate: lastVisit,
      distinctVisitDays: cycle.distinctVisitDays,
      daysSinceLastVisit: cycle.daysSinceLastVisit,
      avgCycleDays: cycle.avgCycleDays ?? cycle.medianCycleDays,
      cycleStatus: cycle.cycleStatus,
      visitTrend: trend.segment,
      churnScore: churn.churnScore,
      hasRecentRedemption: recentRedemptions.has(cusCode),
      hasSentCouponJourney: sentCouponJourneys.has(cusCode),
      todayYmd,
    });

    const marketingSeg: MarketingSegment | null = rec?.segment ?? null;
    if (!customerMatchesAdviceSegment(segment, cycle.cycleStatus, trend.segment, marketingSeg)) {
      continue;
    }

    count++;
    churnSum += churn.churnScore;
    if (cycle.daysSinceLastVisit != null) {
      daysSum += cycle.daysSinceLastVisit;
      daysCount++;
    }
    const cycleBase = cycle.avgCycleDays ?? cycle.medianCycleDays;
    if (cycleBase != null) {
      cycleSum += cycleBase;
      cycleCount++;
    }

    const grade = String(r.pitayaGrade || r.grade || '일반') || '일반';
    gradeBreakdown[grade] = (gradeBreakdown[grade] || 0) + 1;

    if (rec) {
      marketingBreakdown[rec.segmentLabel] = (marketingBreakdown[rec.segmentLabel] || 0) + 1;
      if (rec.couponAction) couponActionSet.add(rec.couponAction);
      if (rec.messageText && sampleMessages.length < 5) {
        sampleMessages.push(rec.messageText);
      }
    }
  }

  return {
    segment,
    segmentLabel: CUSTOMER_ADVICE_SEGMENT_LABELS[segment],
    count,
    avgChurnScore: count > 0 ? Math.round(churnSum / count) : null,
    avgDaysSinceLastVisit: daysCount > 0 ? Math.round(daysSum / daysCount) : null,
    avgCycleDays: cycleCount > 0 ? Math.round(cycleSum / cycleCount) : null,
    marketingBreakdown,
    couponActions: [...couponActionSet].slice(0, 8),
    sampleMessages,
    gradeBreakdown,
  };
}

export function buildSegmentAdvicePrompt(ctx: SegmentMarketingContext): string {
  const lines = [
    `세그먼트: ${ctx.segmentLabel} (${ctx.count}명)`,
    `평균 이탈스코어: ${ctx.avgChurnScore ?? '—'}`,
    `평균 미방문일: ${ctx.avgDaysSinceLastVisit ?? '—'}일`,
    `평균 방문주기: ${ctx.avgCycleDays ?? '—'}일`,
    `등급 분포: ${Object.entries(ctx.gradeBreakdown).map(([k, v]) => `${k} ${v}명`).join(', ') || '없음'}`,
    `마케팅 세부: ${Object.entries(ctx.marketingBreakdown).map(([k, v]) => `${k} ${v}명`).join(', ') || '없음'}`,
    `추천 쿠폰 액션: ${ctx.couponActions.join(' / ') || '없음'}`,
    `샘플 문자: ${ctx.sampleMessages.join(' | ') || '없음'}`,
  ];

  return lines.join('\n');
}
