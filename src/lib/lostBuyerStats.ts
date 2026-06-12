import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';

export interface LostBuyerItemRow {
  itemName: string;
  lostBuyerCount: number;
  repeatBuyerCount: number;
  avgDaysSinceLast: number;
  sampleCodes: string[];
}

export interface LostBuyerSummary {
  sinceYmd: string;
  inactiveDays: number;
  minRepeatPurchases: number;
  items: LostBuyerItemRow[];
  totalLostBuyers: number;
  emptyReason?: string;
}

interface LineRow {
  cusCode: string;
  date: string;
  goodsName: string;
}

async function loadPurchaseLines(storeId: string, sinceYmd: string): Promise<LineRow[]> {
  const lines: LineRow[] = [];
  let last: QueryDocumentSnapshot | null = null;

  while (true) {
    let q = adminDb.collection('pos_customer_purchase_lines')
      .where('storeId', '==', storeId)
      .where('date', '>=', sinceYmd)
      .orderBy('date', 'asc')
      .limit(1000);
    if (last) q = q.startAfter(last);

    const snap = await q.get();
    if (snap.empty) break;

    for (const doc of snap.docs) {
      const d = doc.data();
      const cusCode = String(d.cusCode || '').trim();
      const goodsName = String(d.goodsName || d.barcode || '').trim();
      const date = normDateYMD(String(d.date || ''));
      if (!cusCode || !goodsName || !date) continue;
      lines.push({ cusCode, date, goodsName });
    }

    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }

  return lines;
}

export async function getLostBuyerSummary(
  storeId: string,
  options?: { sinceDays?: number; inactiveDays?: number; minRepeatPurchases?: number; limit?: number },
): Promise<LostBuyerSummary> {
  const today = getKSTTodayYMD();
  const sinceDays = options?.sinceDays ?? 90;
  const inactiveDays = options?.inactiveDays ?? 14;
  const minRepeatPurchases = options?.minRepeatPurchases ?? 2;
  const limit = options?.limit ?? 8;
  const sinceYmd = addDaysYMD(today, -sinceDays);
  const cutoffYmd = addDaysYMD(today, -inactiveDays);

  const lines = await loadPurchaseLines(storeId, sinceYmd);
  if (lines.length === 0) {
    return {
      sinceYmd,
      inactiveDays,
      minRepeatPurchases,
      items: [],
      totalLostBuyers: 0,
      emptyReason: '회원 구매 라인(pos_customer_purchase_lines) 데이터가 없습니다.',
    };
  }

  const byItemCustomer = new Map<string, Map<string, { count: number; lastDate: string }>>();

  for (const line of lines) {
    const item = line.goodsName.slice(0, 40);
    if (!byItemCustomer.has(item)) byItemCustomer.set(item, new Map());
    const custMap = byItemCustomer.get(item)!;
    const cur = custMap.get(line.cusCode) || { count: 0, lastDate: '' };
    cur.count += 1;
    if (!cur.lastDate || line.date > cur.lastDate) cur.lastDate = line.date;
    custMap.set(line.cusCode, cur);
  }

  const items: LostBuyerItemRow[] = [];
  const lostSet = new Set<string>();

  for (const [itemName, custMap] of byItemCustomer.entries()) {
    let lostBuyerCount = 0;
    let repeatBuyerCount = 0;
    let daysSum = 0;
    const sampleCodes: string[] = [];

    for (const [cusCode, stat] of custMap.entries()) {
      if (stat.count < minRepeatPurchases) continue;
      repeatBuyerCount += 1;
      if (stat.lastDate >= cutoffYmd) continue;

      lostBuyerCount += 1;
      lostSet.add(`${itemName}:${cusCode}`);
      const daysSince = Math.floor(
        (new Date(`${today}T12:00:00+09:00`).getTime() - new Date(`${stat.lastDate}T12:00:00+09:00`).getTime()) / 86400000,
      );
      daysSum += daysSince;
      if (sampleCodes.length < 3) sampleCodes.push(cusCode);
    }

    if (lostBuyerCount <= 0) continue;

    items.push({
      itemName,
      lostBuyerCount,
      repeatBuyerCount,
      avgDaysSinceLast: Math.round(daysSum / lostBuyerCount),
      sampleCodes,
    });
  }

  items.sort((a, b) => b.lostBuyerCount - a.lostBuyerCount || b.repeatBuyerCount - a.repeatBuyerCount);

  return {
    sinceYmd,
    inactiveDays,
    minRepeatPurchases,
    items: items.slice(0, limit),
    totalLostBuyers: lostSet.size,
  };
}
