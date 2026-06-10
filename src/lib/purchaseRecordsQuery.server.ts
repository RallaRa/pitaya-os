import { adminDb } from '@/lib/firebase/admin';
import type { PurchaseRecordLike } from '@/lib/purchaseUnitPriceHistory';

/** storeId 단일 필터 + 메모리 정렬 (복합 인덱스 불필요) */
export async function fetchPurchaseRecordsForStore(
  storeId: string,
  opts?: { startDate?: string; endDate?: string; limit?: number },
): Promise<PurchaseRecordLike[]> {
  const limit = opts?.limit ?? 500;
  const snap = await adminDb.collection('purchase_records')
    .where('storeId', '==', storeId)
    .limit(Math.max(limit, 500))
    .get();

  let records = snap.docs.map(d => ({ id: d.id, ...d.data() } as PurchaseRecordLike));

  if (opts?.startDate) {
    records = records.filter(r => (r.purchaseDate || '') >= opts.startDate!);
  }
  if (opts?.endDate) {
    records = records.filter(r => (r.purchaseDate || '') <= opts.endDate!);
  }

  return records
    .sort((a, b) => (b.purchaseDate || '').localeCompare(a.purchaseDate || ''))
    .slice(0, limit);
}
