import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, Timestamp, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';
import { buildVisitDatesMap } from '@/lib/customerVisitCycle';

export type JourneyStep = 'STEP1' | 'STEP2' | 'STEP3' | 'STEP4';
export type NotificationQueueStatus = 'pending' | 'sent' | 'failed' | 'cancelled';

export interface NotificationQueueItem {
  id: string;
  storeId: string;
  customerId: string;
  customerName: string;
  phone: string;
  journeyStep: JourneyStep;
  message: string;
  status: NotificationQueueStatus;
  scheduledAt: string;
  createdAt: unknown;
}

const JOURNEY_MESSAGES: Record<JourneyStep, string> = {
  STEP1: '[Pitaya] 첫 구매 감사드립니다. 다음 방문을 기다리겠습니다.',
  STEP2: '[Pitaya] 재방문 쿠폰이 준비되어 있습니다. 매장에서 확인해 주세요.',
  STEP3: '[Pitaya] 오랜만입니다. 보고 싶었어요! 특별 혜택을 준비했습니다.',
  STEP4: '[Pitaya] 특별 혜택 안내 — 다시 뵙기를 기다립니다.',
};

function kstScheduledTimestamp(ymd: string, hour = 10): Timestamp {
  const h = String(hour).padStart(2, '0');
  return Timestamp.fromDate(new Date(`${ymd}T${h}:00:00+09:00`));
}

async function hasActiveQueueEntry(
  storeId: string,
  customerId: string,
  journeyStep: JourneyStep,
): Promise<boolean> {
  const snap = await adminDb.collection('notification_queue')
    .where('storeId', '==', storeId)
    .where('customerId', '==', customerId)
    .where('journeyStep', '==', journeyStep)
    .limit(20)
    .get();

  return snap.docs.some(d => {
    const st = String(d.data().status || '');
    return st === 'pending' || st === 'sent';
  });
}

interface CustomerJourneyContext {
  cusCode: string;
  customerName: string;
  phone: string;
  firstPurchaseDate: string;
  lastVisit: string;
  distinctVisitDays: number;
}

function buildCustomerContexts(
  storeId: string,
  customerDocs: QueryDocumentSnapshot[],
  salesDocs: Array<{ cusCode?: string; date?: string; totalSale?: number; visitCount?: number }>,
): CustomerJourneyContext[] {
  const visitDatesMap = buildVisitDatesMap(salesDocs);
  const firstPurchaseMap = new Map<string, string>();
  const lastVisitMap = new Map<string, string>();

  for (const row of salesDocs) {
    const code = String(row.cusCode || '');
    const d = normDateYMD(String(row.date || ''));
    const sale = Number(row.totalSale || 0);
    if (!code || !d || sale <= 0) continue;
    const prevFirst = firstPurchaseMap.get(code);
    if (!prevFirst || d < prevFirst) firstPurchaseMap.set(code, d);
    const prevLast = lastVisitMap.get(code);
    if (!prevLast || d > prevLast) lastVisitMap.set(code, d);
  }

  return customerDocs
    .map(doc => {
      const r = doc.data();
      const cusCode = String(r.cusCode || '');
      if (!cusCode) return null;
      const firstPurchaseDate = firstPurchaseMap.get(cusCode) || '';
      const lastVisit = lastVisitMap.get(cusCode) || normDateYMD(String(r.lastVisitDate || ''));
      const distinctVisitDays = visitDatesMap.get(cusCode)?.length || 0;
      return {
        cusCode,
        customerName: r.nameEncrypted ? '고객' : String(r.name || r.cusCode),
        phone: String(r.phoneMasked || ''),
        firstPurchaseDate,
        lastVisit,
        distinctVisitDays,
      } satisfies CustomerJourneyContext;
    })
    .filter(Boolean) as CustomerJourneyContext[];
}

export interface JourneyRunResult {
  storeId: string;
  created: number;
  skipped: number;
  byStep: Record<JourneyStep, number>;
  processedAt: string;
}

export async function runCustomerJourneyForStore(storeId: string): Promise<JourneyRunResult> {
  const todayYmd = getKSTTodayYMD();
  const [customerSnap, salesSnap] = await Promise.all([
    adminDb.collection('pos_customers').where('storeId', '==', storeId).get(),
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
  ]);

  const salesDocs = salesSnap.docs.map(d => d.data());
  const contexts = buildCustomerContexts(storeId, customerSnap.docs, salesDocs);

  let created = 0;
  let skipped = 0;
  const byStep: Record<JourneyStep, number> = { STEP1: 0, STEP2: 0, STEP3: 0, STEP4: 0 };
  let batch = adminDb.batch();
  let batchCount = 0;

  const enqueue = async (
    ctx: CustomerJourneyContext,
    step: JourneyStep,
    scheduledYmd: string,
  ) => {
    if (scheduledYmd > todayYmd) {
      skipped++;
      return;
    }
    if (await hasActiveQueueEntry(storeId, ctx.cusCode, step)) {
      skipped++;
      return;
    }

    const ref = adminDb.collection('notification_queue').doc();
    batch.set(ref, {
      storeId,
      customerId: ctx.cusCode,
      customerName: ctx.customerName,
      phone: ctx.phone,
      journeyStep: step,
      message: JOURNEY_MESSAGES[step],
      status: 'pending' as NotificationQueueStatus,
      scheduledAt: kstScheduledTimestamp(scheduledYmd),
      createdAt: FieldValue.serverTimestamp(),
    });
    created++;
    byStep[step]++;
    batchCount++;
    if (batchCount >= 400) {
      await batch.commit();
      batch = adminDb.batch();
      batchCount = 0;
    }
  };

  for (const ctx of contexts) {
    if (ctx.firstPurchaseDate) {
      const step1Date = addDaysYMD(ctx.firstPurchaseDate, 3);
      await enqueue(ctx, 'STEP1', step1Date);

      const step2Date = addDaysYMD(ctx.firstPurchaseDate, 14);
      if (ctx.distinctVisitDays <= 1) {
        await enqueue(ctx, 'STEP2', step2Date);
      }
    }

    if (ctx.lastVisit) {
      const daysSince = Math.floor(
        (new Date(`${todayYmd}T12:00:00+09:00`).getTime()
          - new Date(`${ctx.lastVisit}T12:00:00+09:00`).getTime()) / 86400000,
      );

      if (daysSince >= 30) {
        await enqueue(ctx, 'STEP3', addDaysYMD(ctx.lastVisit, 30));
      }
      if (daysSince >= 90) {
        await enqueue(ctx, 'STEP4', addDaysYMD(ctx.lastVisit, 90));
      }
    }
  }

  if (batchCount > 0) await batch.commit();

  return { storeId, created, skipped, byStep, processedAt: new Date().toISOString() };
}

export async function runCustomerJourneyAllStores(): Promise<JourneyRunResult[]> {
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  const results: JourneyRunResult[] = [];
  for (const storeDoc of storesSnap.docs) {
    results.push(await runCustomerJourneyForStore(storeDoc.id));
  }
  return results;
}

export async function listNotificationQueue(
  storeId: string,
  opts: { status?: string; page?: number; limit?: number } = {},
) {
  const page = Math.max(1, opts.page || 1);
  const limit = Math.min(100, Math.max(1, opts.limit || 30));

  const snap = await adminDb.collection('notification_queue')
    .where('storeId', '==', storeId)
    .orderBy('createdAt', 'desc')
    .limit(500)
    .get();

  let all = snap.docs.map(d => {
    const r = d.data();
    const sched = r.scheduledAt;
    const scheduledAt = sched?.toDate?.()
      ? sched.toDate().toISOString()
      : String(r.scheduledAt || '');
    return {
      id: d.id,
      storeId: String(r.storeId || ''),
      customerId: String(r.customerId || ''),
      customerName: String(r.customerName || ''),
      phone: String(r.phone || ''),
      journeyStep: r.journeyStep as JourneyStep,
      message: String(r.message || ''),
      status: r.status as NotificationQueueStatus,
      scheduledAt,
      createdAt: r.createdAt,
    } satisfies NotificationQueueItem;
  });

  if (opts.status) {
    all = all.filter(i => i.status === opts.status);
  }

  const total = all.length;
  const items = all.slice((page - 1) * limit, page * limit);
  return { items, total, page, limit };
}

export async function cancelNotificationQueueItem(storeId: string, docId: string): Promise<boolean> {
  const ref = adminDb.collection('notification_queue').doc(docId);
  const snap = await ref.get();
  if (!snap.exists) return false;
  if (String(snap.data()?.storeId || '') !== storeId) return false;

  const status = String(snap.data()?.status || '');
  if (status === 'sent') {
    await ref.update({ status: 'cancelled', cancelledAt: FieldValue.serverTimestamp() });
    return true;
  }
  await ref.delete();
  return true;
}
