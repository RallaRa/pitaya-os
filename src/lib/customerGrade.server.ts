import { adminDb } from '@/lib/firebase/admin';
import { FieldValue, type QueryDocumentSnapshot } from 'firebase-admin/firestore';
import {
  buildGradeMetricsFromSales,
  countByPitayaGrade,
  metricsToGrade,
  type PitayaGrade,
  type SalesRowLite,
} from '@/lib/customerGrade';
import { getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';

export interface GradeUpdateResult {
  storeId: string;
  updated: number;
  unchanged: number;
  total: number;
  byGrade: Record<PitayaGrade, number>;
  processedAt: string;
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

export async function updateStoreCustomerGrades(storeId: string): Promise<GradeUpdateResult> {
  const todayYmd = getKSTTodayYMD();
  const [customerDocs, salesSnap] = await Promise.all([
    fetchAllCustomerDocs(storeId),
    adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
  ]);

  const salesRows = salesSnap.docs.map(d => d.data() as SalesRowLite);
  const salesByCode = new Map<string, SalesRowLite[]>();
  for (const row of salesRows) {
    const code = String(row.cusCode || '');
    if (!code) continue;
    if (!salesByCode.has(code)) salesByCode.set(code, []);
    salesByCode.get(code)!.push(row);
  }

  let updated = 0;
  let unchanged = 0;
  const gradeList: PitayaGrade[] = [];
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
    const metrics = buildGradeMetricsFromSales(
      cusCode,
      salesByCode.get(cusCode) || [],
      String(r.lastVisitDate || ''),
      joinDate,
      todayYmd,
    );
    const pitayaGrade = metricsToGrade(metrics, joinDate, todayYmd);
    gradeList.push(pitayaGrade);

    const prev = String(r.pitayaGrade || '');
    if (prev === pitayaGrade) {
      unchanged++;
      continue;
    }

    batch.update(doc.ref, {
      pitayaGrade,
      pitayaGradeAt: FieldValue.serverTimestamp(),
      pitayaGradeMetrics: {
        lastVisit: metrics.lastVisit,
        daysSinceLastVisit: metrics.daysSinceLastVisit,
        monthlyAvgVisits: Math.round(metrics.monthlyAvgVisits * 100) / 100,
        purchase3Months: metrics.purchase3Months,
      },
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
    total: customerDocs.length,
    byGrade: countByPitayaGrade(gradeList),
    processedAt: new Date().toISOString(),
  };
}

export async function getStoreGradeStats(storeId: string) {
  const docs = await fetchAllCustomerDocs(storeId);
  const empty: Record<PitayaGrade, number> = { VIP: 0, '단골': 0, '일반': 0, '이탈위험': 0, '이탈': 0 };

  for (const doc of docs) {
    const g = String(doc.data().pitayaGrade || '') as PitayaGrade;
    if (g && g in empty) empty[g]++;
    else empty['일반']++;
  }

  return {
    storeId,
    total: docs.length,
    byGrade: empty,
    grades: Object.entries(empty).map(([grade, count]) => ({ grade, count })),
    generatedAt: new Date().toISOString(),
  };
}

export async function updateAllStoreCustomerGrades(): Promise<GradeUpdateResult[]> {
  const storesSnap = await adminDb.collection('stores').limit(100).get();
  const results: GradeUpdateResult[] = [];
  for (const storeDoc of storesSnap.docs) {
    results.push(await updateStoreCustomerGrades(storeDoc.id));
  }
  return results;
}
