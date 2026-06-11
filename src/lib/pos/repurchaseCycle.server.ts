import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp } from 'firebase-admin/firestore';
import { getKSTTodayYMD, normDateYMD, subtractMonthsYMD } from '@/lib/dateUtils';
import {
  buildVisitDatesMap,
  computeVisitCycle,
  mergeVisitCycle,
} from '@/lib/customerVisitCycle';
import { getPosAlertSettings } from '@/lib/pos/posAlertSettings';

export interface RepurchaseDueCustomer {
  cusCode: string;
  name: string;
  phoneMasked: string;
  avgCycleDays: number;
  daysSinceLastVisit: number;
  overdueDays: number;
  lastVisitDate: string;
  pitayaGrade: string;
}

const REPURCHASE_MESSAGE = '[Pitaya] 평소 방문 주기가 지났습니다. 다시 뵙기를 기다립니다.';
const GRACE_DAYS = 2;
const HISTORY_MONTHS = 6;

function kstScheduledTimestamp(ymd: string, hour = 10): Timestamp {
  const h = String(hour).padStart(2, '0');
  return Timestamp.fromDate(new Date(`${ymd}T${h}:00:00+09:00`));
}

async function hasRepurchaseQueueEntry(storeId: string, cusCode: string): Promise<boolean> {
  try {
    const snap = await adminDb.collection('notification_queue')
      .where('storeId', '==', storeId)
      .where('customerId', '==', cusCode)
      .where('queueType', '==', 'repurchase_cycle')
      .limit(10)
      .get();
    return snap.docs.some(d => {
      const st = String(d.data().status || '');
      return st === 'pending' || st === 'sent';
    });
  } catch {
    const snap = await adminDb.collection('notification_queue')
      .where('storeId', '==', storeId)
      .limit(500)
      .get();
    return snap.docs.some(d => {
      const r = d.data();
      return r.customerId === cusCode
        && r.queueType === 'repurchase_cycle'
        && (r.status === 'pending' || r.status === 'sent');
    });
  }
}

export function detectRepurchaseDue(
  cusCode: string,
  visitDates: string[],
  visitCountFallback: number,
  joinDate: string,
  lastVisitDate: string,
  todayYmd: string,
): RepurchaseDueCustomer | null {
  if (!cusCode) return null;
  const cycle = mergeVisitCycle(
    computeVisitCycle(visitDates, todayYmd),
    visitCountFallback,
    joinDate,
    lastVisitDate,
  );
  const avgCycle = cycle.avgCycleDays ?? cycle.medianCycleDays;
  if (!avgCycle || cycle.distinctVisitDays < 2) return null;
  const daysSince = cycle.daysSinceLastVisit;
  if (daysSince == null) return null;
  if (daysSince <= avgCycle + GRACE_DAYS) return null;

  return {
    cusCode,
    name: '',
    phoneMasked: '',
    avgCycleDays: avgCycle,
    daysSinceLastVisit: daysSince,
    overdueDays: daysSince - avgCycle - GRACE_DAYS,
    lastVisitDate: visitDates.length ? visitDates[visitDates.length - 1] : lastVisitDate,
    pitayaGrade: '',
  };
}

export interface RepurchaseCycleRunResult {
  storeId: string;
  dueCount: number;
  queued: number;
  skipped: number;
  processedAt: string;
}

export async function runRepurchaseCycleForStore(storeId: string): Promise<RepurchaseCycleRunResult> {
  const settings = await getPosAlertSettings(storeId);
  const todayYmd = getKSTTodayYMD();
  const sinceYmd = subtractMonthsYMD(todayYmd, HISTORY_MONTHS);

  const [customerSnap, salesSnap] = await Promise.all([
    adminDb.collection('pos_customers').where('storeId', '==', storeId).get(),
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
  ]);

  const salesDocs = salesSnap.docs
    .map(d => d.data())
    .filter(r => {
      const d = normDateYMD(String(r.date || ''));
      return d && d >= sinceYmd && d <= todayYmd;
    });

  const visitDatesMap = buildVisitDatesMap(salesDocs);
  const dueList: RepurchaseDueCustomer[] = [];
  let queued = 0;
  let skipped = 0;
  let batch = adminDb.batch();
  let batchCount = 0;

  const flush = async () => {
    if (batchCount === 0) return;
    await batch.commit();
    batch = adminDb.batch();
    batchCount = 0;
  };

  for (const doc of customerSnap.docs) {
    const r = doc.data();
    const cusCode = String(r.cusCode || '').trim();
    if (!cusCode) continue;

    const visitDates = visitDatesMap.get(cusCode) || [];
    const due = detectRepurchaseDue(
      cusCode,
      visitDates,
      Number(r.visitCount || 0),
      normDateYMD(String(r.joinDate || '')),
      normDateYMD(String(r.lastVisitDate || '')),
      todayYmd,
    );
    if (!due) continue;

    due.name = String(r.name || r.cusCode || '고객');
    due.phoneMasked = String(r.phoneMasked || '');
    due.pitayaGrade = String(r.pitayaGrade || r.grade || '일반');
    dueList.push(due);

    if (!settings.repurchaseReminderEnabled) continue;

    if (await hasRepurchaseQueueEntry(storeId, cusCode)) {
      skipped += 1;
      continue;
    }

    const ref = adminDb.collection('notification_queue').doc();
    batch.set(ref, {
      storeId,
      customerId: cusCode,
      customerName: due.name,
      phone: due.phoneMasked,
      queueType: 'repurchase_cycle',
      journeyStep: 'REPURCHASE',
      message: REPURCHASE_MESSAGE,
      status: 'pending',
      avgCycleDays: due.avgCycleDays,
      daysSinceLastVisit: due.daysSinceLastVisit,
      overdueDays: due.overdueDays,
      scheduledAt: kstScheduledTimestamp(todayYmd),
      createdAt: FieldValue.serverTimestamp(),
    });
    queued += 1;
    batchCount += 1;
    if (batchCount >= 400) await flush();
  }

  await flush();

  dueList.sort((a, b) => b.overdueDays - a.overdueDays);

  await adminDb.collection('pos_repurchase_due').doc(storeId).set({
    storeId,
    date: todayYmd,
    customers: dueList.slice(0, 50),
    count: dueList.length,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return {
    storeId,
    dueCount: dueList.length,
    queued,
    skipped,
    processedAt: new Date().toISOString(),
  };
}

export async function runRepurchaseCycleAllStores(): Promise<RepurchaseCycleRunResult[]> {
  const storesSnap = await adminDb.collection('stores').where('status', '==', 'active').get();
  const results: RepurchaseCycleRunResult[] = [];
  for (const storeDoc of storesSnap.docs) {
    results.push(await runRepurchaseCycleForStore(storeDoc.id));
  }
  return results;
}

export async function fetchRepurchaseDueCustomers(storeId: string): Promise<{
  date: string;
  count: number;
  customers: RepurchaseDueCustomer[];
}> {
  const doc = await adminDb.collection('pos_repurchase_due').doc(storeId).get();
  if (!doc.exists) {
    return { date: getKSTTodayYMD(), count: 0, customers: [] };
  }
  const data = doc.data() || {};
  return {
    date: String(data.date || getKSTTodayYMD()),
    count: Number(data.count || 0),
    customers: Array.isArray(data.customers) ? data.customers as RepurchaseDueCustomer[] : [],
  };
}
