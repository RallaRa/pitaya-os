import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import {
  aggregateSalesCategories,
  DEFAULT_SALES_CATEGORY_KEYWORDS,
  type SalesCategoryKeywords,
  type SalesLineInput,
} from '@/lib/pos/salesCategory';

export async function getStoreSalesCategoryKeywords(
  storeId: string,
): Promise<Partial<SalesCategoryKeywords>> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = doc.data()?.posSalesCategoryKeywords;
  if (!raw || typeof raw !== 'object') return {};
  return raw as Partial<SalesCategoryKeywords>;
}

export async function saveStoreSalesCategoryKeywords(
  storeId: string,
  keywords: Partial<SalesCategoryKeywords>,
): Promise<SalesCategoryKeywords> {
  const merged = {
    ...DEFAULT_SALES_CATEGORY_KEYWORDS,
    ...keywords,
  };
  await adminDb.collection('store_settings').doc(storeId).set({
    storeId,
    posSalesCategoryKeywords: merged,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
  return merged;
}

export async function upsertSalesCategoriesForDate(
  storeId: string,
  date: string,
  items: SalesLineInput[],
  syncedAt?: string,
): Promise<void> {
  const customKeywords = await getStoreSalesCategoryKeywords(storeId);
  const agg = aggregateSalesCategories(items, customKeywords);
  const docId = `${storeId}_${date}`.replace(/[/\\#?]/g, '_').slice(0, 500);

  await adminDb.collection('sales_categories').doc(docId).set({
    storeId,
    date,
    ...agg,
    syncedAt: syncedAt || new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

/** daily_reports items 기반 재집계 (자정 cron용) */
export async function rebuildSalesCategoriesFromDailyReport(
  storeId: string,
  date: string,
): Promise<boolean> {
  const snap = await adminDb.collection('daily_reports').doc(`pos_${storeId}_${date}`).get();
  if (!snap.exists) return false;
  const items = (snap.data()?.items || []) as SalesLineInput[];
  await upsertSalesCategoriesForDate(storeId, date, items.map(it => ({
    name: it.name,
    netSales: it.netSales ?? it.amount,
    qty: it.qty,
  })));
  return true;
}
