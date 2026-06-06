import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';

export interface CustomerPurchaseLineInput {
  cusCode: string;
  date: string;
  saleNum: string;
  saleTime?: string;
  posNo?: string;
  receiptTotal?: number;
  barcode?: string;
  goodsName?: string;
  categoryCode?: string;
  categoryName?: string;
  saleCount?: number;
  sellPrice?: number;
  totalPrice?: number;
  purPrice?: number;
  profitPrice?: number;
}

export interface CustomerPurchaseLineDoc extends CustomerPurchaseLineInput {
  storeId: string;
  syncedAt: string;
}

export interface CustomerTopItem {
  name: string;
  qty: number;
  amount: number;
  categoryName: string;
  lastDate: string;
}

export interface CustomerPurchaseReceipt {
  saleNum: string;
  date: string;
  saleTime: string;
  posNo: string;
  receiptTotal: number;
  items: Array<{
    barcode: string;
    goodsName: string;
    categoryName: string;
    saleCount: number;
    totalPrice: number;
  }>;
}

function purchaseLineDocId(
  storeId: string,
  saleNum: string,
  lineKey: string,
): string {
  const safeSale = String(saleNum || 'UNKNOWN').replace(/[/\\]/g, '_');
  const safeKey = String(lineKey || '0').replace(/[/\\]/g, '_');
  return `${storeId}_${safeSale}_${safeKey}`;
}

function lineKey(line: CustomerPurchaseLineInput, index: number): string {
  const barcode = String(line.barcode || 'NO_BAR').replace(/[/\\]/g, '_');
  return `${barcode}_${index}`;
}

/** 해당 일자 회원 구매 라인 전체 교체 (재동기화 시 중복 방지) */
export async function replaceCustomerPurchaseLinesForDate(
  storeId: string,
  date: string,
  lines: CustomerPurchaseLineInput[],
  syncedAt: string,
): Promise<number> {
  const col = adminDb.collection('pos_customer_purchase_lines');

  const existing = await col
    .where('storeId', '==', storeId)
    .where('date', '==', date)
    .select()
    .get();

  let saved = 0;
  const CHUNK = 400;

  for (let i = 0; i < existing.docs.length; i += CHUNK) {
    const batch = adminDb.batch();
    existing.docs.slice(i, i + CHUNK).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  for (let i = 0; i < lines.length; i += CHUNK) {
    const batch = adminDb.batch();
    const chunk = lines.slice(i, i + CHUNK);
    chunk.forEach((line, idx) => {
      const cusCode = String(line.cusCode || '').trim();
      const saleNum = String(line.saleNum || '').trim();
      if (!cusCode || !saleNum) return;
      const key = lineKey(line, i + idx);
      batch.set(
        col.doc(purchaseLineDocId(storeId, saleNum, key)),
        {
          storeId,
          cusCode,
          date,
          saleNum,
          saleTime: line.saleTime ?? '',
          posNo: line.posNo ?? '',
          receiptTotal: Number(line.receiptTotal ?? 0),
          barcode: line.barcode ?? '',
          goodsName: line.goodsName ?? '',
          categoryCode: line.categoryCode ?? '',
          categoryName: line.categoryName ?? '',
          saleCount: Number(line.saleCount ?? 0),
          sellPrice: Number(line.sellPrice ?? 0),
          totalPrice: Number(line.totalPrice ?? 0),
          purPrice: Number(line.purPrice ?? 0),
          profitPrice: Number(line.profitPrice ?? 0),
          syncedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      saved++;
    });
    await batch.commit();
  }

  return saved;
}

/** 회원별 인기 품목 (동기화된 라인 기준) */
export async function fetchCustomerTopItems(
  storeId: string,
  cusCode: string,
  sinceYmd?: string,
  limit = 10,
): Promise<CustomerTopItem[]> {
  const since = sinceYmd || addDaysYMD(getKSTTodayYMD(), -89);
  const snap = await adminDb.collection('pos_customer_purchase_lines')
    .where('storeId', '==', storeId)
    .where('cusCode', '==', cusCode)
    .where('date', '>=', since)
    .orderBy('date', 'desc')
    .limit(2000)
    .get();

  const map: Record<string, CustomerTopItem> = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    const name = String(d.goodsName || d.barcode || '').trim();
    if (!name) continue;
    if (!map[name]) {
      map[name] = {
        name,
        qty: 0,
        amount: 0,
        categoryName: String(d.categoryName || ''),
        lastDate: String(d.date || ''),
      };
    }
    map[name].qty += Number(d.saleCount || 0);
    map[name].amount += Number(d.totalPrice || 0);
    const dt = String(d.date || '');
    if (dt > map[name].lastDate) map[name].lastDate = dt;
  }

  return Object.values(map)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}

/** 회원 최근 구매 영수증 목록 */
export async function fetchCustomerPurchaseReceipts(
  storeId: string,
  cusCode: string,
  limit = 15,
): Promise<CustomerPurchaseReceipt[]> {
  const snap = await adminDb.collection('pos_customer_purchase_lines')
    .where('storeId', '==', storeId)
    .where('cusCode', '==', cusCode)
    .orderBy('date', 'desc')
    .limit(500)
    .get();

  const receiptMap = new Map<string, CustomerPurchaseReceipt>();
  for (const doc of snap.docs) {
    const d = doc.data();
    const saleNum = String(d.saleNum || '');
    if (!saleNum) continue;
    if (!receiptMap.has(saleNum)) {
      receiptMap.set(saleNum, {
        saleNum,
        date: String(d.date || ''),
        saleTime: String(d.saleTime || ''),
        posNo: String(d.posNo || ''),
        receiptTotal: Number(d.receiptTotal || 0),
        items: [],
      });
    }
    const receipt = receiptMap.get(saleNum)!;
    receipt.items.push({
      barcode: String(d.barcode || ''),
      goodsName: String(d.goodsName || ''),
      categoryName: String(d.categoryName || ''),
      saleCount: Number(d.saleCount || 0),
      totalPrice: Number(d.totalPrice || 0),
    });
    if (!receipt.receiptTotal) {
      receipt.receiptTotal = receipt.items.reduce((s, it) => s + it.totalPrice, 0);
    }
  }

  return [...receiptMap.values()]
    .sort((a, b) => {
      if (a.date !== b.date) return b.date.localeCompare(a.date);
      return b.saleTime.localeCompare(a.saleTime);
    })
    .slice(0, limit);
}

/** 세그먼트(복수 회원)별 대표 품목 — 쿠폰 타깃용 */
export async function aggregateTopItemsForCustomers(
  storeId: string,
  cusCodes: string[],
  sinceYmd?: string,
  limit = 8,
): Promise<CustomerTopItem[]> {
  if (!cusCodes.length) return [];
  const since = sinceYmd || addDaysYMD(getKSTTodayYMD(), -89);
  const codeSet = new Set(cusCodes);
  const snap = await adminDb.collection('pos_customer_purchase_lines')
    .where('storeId', '==', storeId)
    .where('date', '>=', since)
    .orderBy('date', 'desc')
    .limit(8000)
    .get();

  const map: Record<string, CustomerTopItem> = {};
  for (const doc of snap.docs) {
    const d = doc.data();
    if (!codeSet.has(String(d.cusCode || ''))) continue;
    const name = String(d.goodsName || d.barcode || '').trim();
    if (!name) continue;
    if (!map[name]) {
      map[name] = { name, qty: 0, amount: 0, categoryName: String(d.categoryName || ''), lastDate: '' };
    }
    map[name].qty += Number(d.saleCount || 0);
    map[name].amount += Number(d.totalPrice || 0);
  }

  return Object.values(map)
    .sort((a, b) => b.amount - a.amount)
    .slice(0, limit);
}
