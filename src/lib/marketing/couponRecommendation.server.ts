import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';
import {
  buildVisitDatesFromSales,
  computeChurnScore,
  groupSalesByCustomer,
  type SalesRowLite,
} from '@/lib/customerChurnScore';
import { decryptCustomerFields } from '@/lib/customerPii';
import { computeVisitTrend } from '@/lib/customerVisitTrend';
import { mergeVisitCycle, computeVisitCycle } from '@/lib/customerVisitCycle';
import {
  classifyMarketingRecommendation,
  type MarketingRecommendation,
} from '@/lib/marketing/couponRecommendation';

export interface MarketingRecommendResult {
  storeId: string;
  generatedAt: string;
  totalCustomers: number;
  recommendationCount: number;
  items: MarketingRecommendation[];
  segmentCounts: Record<string, number>;
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

function buildRedemptionSet(
  logs: QueryDocumentSnapshot[],
  sinceYmd: string,
): Set<string> {
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

function buildSentCouponJourneySet(
  queueDocs: QueryDocumentSnapshot[],
  sinceYmd: string,
): Set<string> {
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

export async function buildMarketingRecommendations(
  storeId: string,
  opts: { includePii?: boolean; limit?: number } = {},
): Promise<MarketingRecommendResult> {
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

  const items: MarketingRecommendation[] = [];

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

    const pii = opts.includePii ? decryptCustomerFields(r) : { name: '', phone: '', birth: '' };
    const name = opts.includePii
      ? (pii.name || String(r.name || cusCode))
      : String(r.nameMasked || '고객');
    const phone = opts.includePii ? (pii.phone || '') : '';
    const phoneMasked = String(r.phoneMasked || '');

    const rec = classifyMarketingRecommendation({
      cusCode,
      name,
      phone,
      phoneMasked,
      birth: opts.includePii ? pii.birth : '',
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

    if (rec) items.push(rec);
  }

  items.sort((a, b) => a.priority - b.priority || (b.churnScore - a.churnScore));
  const capped = opts.limit ? items.slice(0, opts.limit) : items;

  const segmentCounts: Record<string, number> = {};
  for (const row of capped) {
    segmentCounts[row.segmentLabel] = (segmentCounts[row.segmentLabel] || 0) + 1;
  }

  return {
    storeId,
    generatedAt: new Date().toISOString(),
    totalCustomers: customerDocs.length,
    recommendationCount: capped.length,
    items: capped,
    segmentCounts,
  };
}
