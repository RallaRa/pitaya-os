import { fetchMeatTraceByNo } from '@/lib/meatTrace/fetchMeatTrace';
import { isMeatCategory } from '@/lib/purchaseCategories';
import { createExpiryReminder } from '@/lib/expiryReminder/createExpiryReminder';
import type { CreateExpiryReminderResult } from '@/lib/expiryReminder/types';

export interface PurchaseItemForExpiry {
  name?: string;
  traceNo?: string;
  category?: string;
}

export interface ExpiryFromPurchaseDetail {
  traceNo: string;
  itemName: string;
  expiryDate?: string;
  ok: boolean;
  reason?: string;
  result?: CreateExpiryReminderResult;
}

export interface RegisterExpiryFromPurchaseResult {
  processed: number;
  registered: number;
  skipped: number;
  details: ExpiryFromPurchaseDetail[];
}

function buildItemLabel(name: string, traceNo: string): string {
  const base = (name || '품목').trim().slice(0, 60);
  const tail = traceNo.slice(-4);
  return tail ? `${base} (${tail})` : base;
}

/**
 * AI 매입 저장 시 이력번호 품목 → 이력 API 유통기한 → 캘린더·알림 등록
 */
export async function registerExpiryRemindersFromPurchase(opts: {
  storeId: string;
  createdBy: string;
  purchaseRecordId?: string;
  items: PurchaseItemForExpiry[];
}): Promise<RegisterExpiryFromPurchaseResult> {
  const { storeId, createdBy, purchaseRecordId, items } = opts;
  const details: ExpiryFromPurchaseDetail[] = [];
  let registered = 0;
  let skipped = 0;
  let processed = 0;

  const seenTrace = new Set<string>();

  for (const item of items) {
    const traceNo = String(item.traceNo || '').replace(/\D/g, '');
    if (traceNo.length < 12) continue;
    const cat = String(item.category || '').trim();
    if (cat && !isMeatCategory(cat)) continue;
    if (seenTrace.has(traceNo)) continue;
    seenTrace.add(traceNo);
    processed += 1;

    const itemName = buildItemLabel(String(item.name || ''), traceNo);

    try {
      const trace = await fetchMeatTraceByNo(traceNo);
      if (!trace.found) {
        skipped += 1;
        details.push({ traceNo, itemName, ok: false, reason: trace.message || '이력 조회 실패' });
        continue;
      }
      if (!trace.expiryDate) {
        skipped += 1;
        details.push({
          traceNo,
          itemName,
          ok: false,
          reason: '이력 API에 유통기한(소비기한) 정보 없음',
        });
        continue;
      }

      const result = await createExpiryReminder({
        storeId,
        createdBy,
        itemName,
        expiryDate: trace.expiryDate,
        source: 'purchase_trace',
        traceNo,
        purchaseRecordId,
      });

      registered += 1;
      details.push({
        traceNo,
        itemName,
        expiryDate: trace.expiryDate,
        ok: true,
        result,
      });
    } catch (e: unknown) {
      skipped += 1;
      details.push({
        traceNo,
        itemName,
        ok: false,
        reason: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return { processed, registered, skipped, details };
}
