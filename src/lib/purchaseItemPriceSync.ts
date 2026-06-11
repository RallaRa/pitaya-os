import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  buildItemPriceDocPayload,
  extractItemLinesFromRecords,
  itemPriceDocId,
  mergePurchaseLines,
  type PurchaseLineEntry,
} from '@/lib/purchaseUnitPriceHistory';

export async function syncItemPricesForPurchase(
  storeId: string,
  purchaseRecordId: string,
  purchaseDate: string,
  supplierName: string,
  invoiceNumber: string | undefined,
  items: Array<{
    name?: string;
    unitPrice?: number;
    qty?: number;
    unit?: string;
    supplyAmount?: number;
    category?: string;
  }>,
): Promise<string[]> {
  const today = getKSTTodayYMD();
  const names = new Set<string>();

  for (const it of items) {
    const name = (it.name || '').trim();
    if (!name || !it.unitPrice) continue;
    names.add(name);
  }

  const syncedItems = [...names];

  await Promise.all(syncedItems.map(async name => {
    const docId = itemPriceDocId(storeId, name);
    const ref = adminDb.collection('item_prices').doc(docId);
    const snap = await ref.get();
    const existing: PurchaseLineEntry[] = snap.exists ? (snap.data()?.lines || []) : [];

    const incoming = extractItemLinesFromRecords(
      [{
        id: purchaseRecordId,
        purchaseDate,
        supplierName,
        invoiceNumber,
        items,
      }],
      name,
    );

    const merged = mergePurchaseLines(existing, incoming);
    const payload = buildItemPriceDocPayload(storeId, name, merged, today);

    await ref.set({
      ...payload,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
  }));

  return syncedItems;
}
