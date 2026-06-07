import { adminDb } from '@/lib/firebase/admin';
import {
  serializeTimestamp,
  type CustomerRequestLog,
  type RequestAttachment,
} from '@/lib/customerRequestLog';

/** POS 토스트용 — 회원 최근 요청 이력 요약 (서버 전용) */
export async function fetchCustomerRequestSummaries(
  storeId: string,
  cusCode: string,
  limit = 5,
): Promise<CustomerRequestLog[]> {
  const snap = await adminDb.collection('customer_request_logs')
    .where('storeId', '==', storeId)
    .where('cusCode', '==', cusCode)
    .limit(Math.max(limit * 5, 20))
    .get();

  const rows = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      storeId: String(d.storeId || ''),
      cusCode: String(d.cusCode || ''),
      requestDate: String(d.requestDate || ''),
      requestTime: String(d.requestTime || ''),
      dayOfWeek: String(d.dayOfWeek || ''),
      content: String(d.content || ''),
      attachments: (d.attachments || []) as RequestAttachment[],
      createdAt: serializeTimestamp(d.createdAt),
      updatedAt: serializeTimestamp(d.updatedAt),
      createdByEmail: String(d.createdByEmail || ''),
      updatedByEmail: String(d.updatedByEmail || ''),
    };
  });

  rows.sort((a, b) => String(b.updatedAt || '').localeCompare(String(a.updatedAt || '')));
  return rows.slice(0, limit);
}
