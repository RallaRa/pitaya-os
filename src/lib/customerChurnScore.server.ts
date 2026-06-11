import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';
import {
  CHURN_RISK_THRESHOLD,
  buildVisitDatesFromSales,
  computeChurnScore,
  groupSalesByCustomer,
  type ChurnScoreFactors,
  type SalesRowLite,
} from '@/lib/customerChurnScore';
import type { VisitTrendSegment } from '@/lib/customerVisitTrend';

export interface ChurnUpdateResult {
  storeId: string;
  updated: number;
  unchanged: number;
  atRiskCount: number;
  total: number;
  processedAt: string;
}

export interface ChurnRiskCustomer {
  cusCode: string;
  name: string;
  phoneMasked: string;
  churnScore: number;
  factors: ChurnScoreFactors;
  daysSinceLastVisit: number | null;
  avgCycleDays: number | null;
  visitTrend: VisitTrendSegment;
  lastVisitDate: string;
  pitayaGrade: string;
  churnScoreUpdatedAt: string | null;
}

const RETENTION_MESSAGE = '[Pitaya] 오랜만입니다. 특별 혜택을 준비했습니다. 다시 뵙기를 기다립니다.';

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

function kstScheduledTimestamp(ymd: string, hour = 10): Timestamp {
  const h = String(hour).padStart(2, '0');
  return Timestamp.fromDate(new Date(`${ymd}T${h}:00:00+09:00`));
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

export async function updateStoreChurnScores(storeId: string): Promise<ChurnUpdateResult> {
  const todayYmd = getKSTTodayYMD();
  const redemptionSince = addDaysYMD(todayYmd, -90);
  const journeySince = addDaysYMD(todayYmd, -90);

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
  const sentCouponJourneys = buildSentCouponJourneySet(queueSnap.docs, journeySince);

  let updated = 0;
  let unchanged = 0;
  let atRiskCount = 0;
  const batchSize = 400;
  let batch = adminDb.batch();
  let batchCount = 0;

  const flush = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = adminDb.batch();
    batchCount = 0;
  };

  for (const doc of customerDocs) {
    const r = doc.data();
    const cusCode = String(r.cusCode || '');
    if (!cusCode) continue;

    const joinDate = normDateYMD(String(r.joinDate || r.writeDate || ''));
    const lastVisitDate = normDateYMD(String(r.lastVisitDate || ''));
    const visitCount = Number(r.visitCount || 0);
    const visitDates = visitDatesMap.get(cusCode) || [];

    const result = computeChurnScore({
      visitDates,
      salesRows: salesByCode.get(cusCode) || [],
      fallbackVisitCount: visitCount,
      joinDate,
      lastVisitDate,
      hasRecentRedemption: recentRedemptions.has(cusCode),
      hasSentCouponJourney: sentCouponJourneys.has(cusCode),
      todayYmd,
    });

    if (result.isAtRisk) atRiskCount++;

    const prevScore = Number(r.churnScore ?? -1);
    const prevFactors = JSON.stringify(r.churnFactors || {});
    const nextFactors = JSON.stringify(result.factors);
    if (prevScore === result.churnScore && prevFactors === nextFactors) {
      unchanged++;
      continue;
    }

    batch.update(doc.ref, {
      churnScore: result.churnScore,
      churnFactors: result.factors,
      churnVisitTrend: result.visitTrend,
      churnDaysSinceLastVisit: result.daysSinceLastVisit,
      churnAvgCycleDays: result.avgCycleDays,
      churnScoreUpdatedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    updated++;
    batchCount++;
    if (batchCount >= batchSize) await flush();
  }

  await flush();

  return {
    storeId,
    updated,
    unchanged,
    atRiskCount,
    total: customerDocs.length,
    processedAt: new Date().toISOString(),
  };
}

export async function updateAllStoreChurnScores(): Promise<ChurnUpdateResult[]> {
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  const results: ChurnUpdateResult[] = [];
  for (const storeDoc of storesSnap.docs) {
    results.push(await updateStoreChurnScores(storeDoc.id));
  }
  return results;
}

function tsToIso(ts: unknown): string | null {
  if (!ts) return null;
  if (typeof ts === 'object' && ts !== null && 'toDate' in ts) {
    const d = (ts as { toDate: () => Date }).toDate();
    return d.toISOString();
  }
  return null;
}

export async function listChurnRiskCustomers(
  storeId: string,
  opts: { minScore?: number; limit?: number } = {},
): Promise<{
  items: ChurnRiskCustomer[];
  totalAtRisk: number;
  threshold: number;
  processedAt: string | null;
}> {
  const minScore = opts.minScore ?? CHURN_RISK_THRESHOLD;
  const limit = Math.min(100, Math.max(1, opts.limit ?? 10));

  const docs = await fetchAllCustomerDocs(storeId);
  const rows: ChurnRiskCustomer[] = [];

  for (const doc of docs) {
    const r = doc.data();
    const score = Number(r.churnScore ?? 0);
    if (score < minScore) continue;

    rows.push({
      cusCode: String(r.cusCode || ''),
      name: r.nameEncrypted ? '고객' : String(r.name || r.cusCode || ''),
      phoneMasked: String(r.phoneMasked || ''),
      churnScore: score,
      factors: (r.churnFactors || {
        overdueDays: 0,
        frequencyDecline: 0,
        spendDecline: 0,
        couponUnused: 0,
      }) as ChurnScoreFactors,
      daysSinceLastVisit: r.churnDaysSinceLastVisit != null
        ? Number(r.churnDaysSinceLastVisit)
        : null,
      avgCycleDays: r.churnAvgCycleDays != null ? Number(r.churnAvgCycleDays) : null,
      visitTrend: (r.churnVisitTrend || 'unknown') as VisitTrendSegment,
      lastVisitDate: normDateYMD(String(r.lastVisitDate || '')),
      pitayaGrade: String(r.pitayaGrade || ''),
      churnScoreUpdatedAt: tsToIso(r.churnScoreUpdatedAt),
    });
  }

  rows.sort((a, b) => b.churnScore - a.churnScore);

  let latestProcessed: string | null = null;
  for (const row of rows) {
    if (row.churnScoreUpdatedAt && (!latestProcessed || row.churnScoreUpdatedAt > latestProcessed)) {
      latestProcessed = row.churnScoreUpdatedAt;
    }
  }

  return {
    items: rows.slice(0, limit),
    totalAtRisk: rows.length,
    threshold: minScore,
    processedAt: latestProcessed,
  };
}

export interface EnqueueChurnRetentionResult {
  created: number;
  skipped: number;
  failures: { cusCode: string; reason: string }[];
}

async function hasActiveChurnQueue(storeId: string, cusCode: string): Promise<boolean> {
  const snap = await adminDb.collection('notification_queue')
    .where('storeId', '==', storeId)
    .where('customerId', '==', cusCode)
    .where('source', '==', 'churn_retention')
    .limit(10)
    .get();

  return snap.docs.some(d => {
    const st = String(d.data().status || '');
    return st === 'pending' || st === 'sent';
  });
}

export async function enqueueChurnRetentionMessages(
  storeId: string,
  cusCodes: string[],
): Promise<EnqueueChurnRetentionResult> {
  const todayYmd = getKSTTodayYMD();
  const unique = [...new Set(cusCodes.map(c => c.trim()).filter(Boolean))];
  let created = 0;
  let skipped = 0;
  const failures: { cusCode: string; reason: string }[] = [];

  for (const cusCode of unique) {
    const docId = `${storeId}_${cusCode}`;
    const custSnap = await adminDb.collection('pos_customers').doc(docId).get();
    if (!custSnap.exists || String(custSnap.data()?.storeId || '') !== storeId) {
      failures.push({ cusCode, reason: '고객 없음' });
      continue;
    }

    const r = custSnap.data()!;
    const score = Number(r.churnScore ?? 0);
    if (score < CHURN_RISK_THRESHOLD) {
      skipped++;
      continue;
    }

    if (await hasActiveChurnQueue(storeId, cusCode)) {
      skipped++;
      continue;
    }

    const ref = adminDb.collection('notification_queue').doc();
    await ref.set({
      storeId,
      customerId: cusCode,
      customerName: r.nameEncrypted ? '고객' : String(r.name || cusCode),
      phone: String(r.phoneMasked || ''),
      journeyStep: 'STEP3',
      source: 'churn_retention',
      churnScore: score,
      message: RETENTION_MESSAGE,
      status: 'pending',
      scheduledAt: kstScheduledTimestamp(todayYmd),
      createdAt: FieldValue.serverTimestamp(),
    });
    created++;
  }

  return { created, skipped, failures };
}
