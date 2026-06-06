import { adminDb } from '@/lib/firebase/admin';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';
import { addDaysYMD, getKSTTodayYMD, normDateYMD } from '@/lib/dateUtils';

const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'] as const;

export interface PurchaseLineRow {
  date: string;
  saleNum: string;
  goodsName: string;
  saleCount: number;
  totalPrice: number;
}

export interface CoPurchasePair {
  item: string;
  togetherCount: number;
  anchorRate: number;
  overallRate: number;
  lift: number;
}

export interface CoPurchaseAnalysis {
  anchorKeyword: string;
  matchedAnchors: string[];
  anchorReceiptCount: number;
  totalReceiptCount: number;
  pairs: CoPurchasePair[];
}

export interface DowTopItem {
  name: string;
  qty: number;
  amount: number;
  share: number;
}

export interface DowItemAnalysis {
  dow: string;
  dowIndex: number;
  receiptCount: number;
  topItems: DowTopItem[];
}

export interface PurchaseAnalyticsResult {
  sinceYmd: string;
  lineCount: number;
  receiptCount: number;
  coPurchase: CoPurchaseAnalysis;
  dowItems: DowItemAnalysis[];
  popularItems: Array<{ name: string; qty: number; amount: number }>;
}

function normalizeItemName(name: string): string {
  return String(name || '').trim().replace(/\s+/g, ' ');
}

async function loadPurchaseLines(
  storeId: string,
  sinceYmd: string,
): Promise<PurchaseLineRow[]> {
  const lines: PurchaseLineRow[] = [];
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
      const saleNum = String(d.saleNum || '').trim();
      const goodsName = normalizeItemName(String(d.goodsName || d.barcode || ''));
      if (!saleNum || !goodsName) continue;
      lines.push({
        date: normDateYMD(String(d.date || '')),
        saleNum,
        goodsName,
        saleCount: Number(d.saleCount || 0),
        totalPrice: Number(d.totalPrice || 0),
      });
    }

    last = snap.docs[snap.docs.length - 1];
    if (snap.size < 1000) break;
  }

  return lines;
}

function buildReceiptMap(lines: PurchaseLineRow[]): Map<string, { date: string; items: Map<string, { qty: number; amount: number }> }> {
  const receipts = new Map<string, { date: string; items: Map<string, { qty: number; amount: number }> }>();
  for (const line of lines) {
    if (!receipts.has(line.saleNum)) {
      receipts.set(line.saleNum, { date: line.date, items: new Map() });
    }
    const receipt = receipts.get(line.saleNum)!;
    if (!receipt.date && line.date) receipt.date = line.date;
    const cur = receipt.items.get(line.goodsName) || { qty: 0, amount: 0 };
    cur.qty += line.saleCount || 1;
    cur.amount += line.totalPrice || 0;
    receipt.items.set(line.goodsName, cur);
  }
  return receipts;
}

function analyzeCoPurchase(
  receipts: Map<string, { date: string; items: Map<string, { qty: number; amount: number }> }>,
  anchorKeyword: string,
): CoPurchaseAnalysis {
  const keyword = anchorKeyword.trim().toLowerCase();
  const totalReceiptCount = receipts.size;

  const anchorNames = new Set<string>();
  for (const receipt of receipts.values()) {
    for (const name of receipt.items.keys()) {
      if (keyword && name.toLowerCase().includes(keyword)) anchorNames.add(name);
    }
  }

  const matchedAnchors = [...anchorNames].sort((a, b) => a.localeCompare(b, 'ko'));
  let anchorReceiptCount = 0;
  const coCounts = new Map<string, number>();
  const overallCounts = new Map<string, number>();

  for (const receipt of receipts.values()) {
    const itemNames = [...receipt.items.keys()];
    for (const name of itemNames) {
      overallCounts.set(name, (overallCounts.get(name) || 0) + 1);
    }

    const hasAnchor = keyword
      ? itemNames.some(n => n.toLowerCase().includes(keyword))
      : false;
    if (!hasAnchor) continue;

    anchorReceiptCount++;
    for (const name of itemNames) {
      if (keyword && name.toLowerCase().includes(keyword)) continue;
      coCounts.set(name, (coCounts.get(name) || 0) + 1);
    }
  }

  const pairs: CoPurchasePair[] = [...coCounts.entries()]
    .map(([item, togetherCount]) => {
      const overallRate = totalReceiptCount > 0
        ? Math.round((overallCounts.get(item)! / totalReceiptCount) * 1000) / 10
        : 0;
      const anchorRate = anchorReceiptCount > 0
        ? Math.round((togetherCount / anchorReceiptCount) * 1000) / 10
        : 0;
      const lift = overallRate > 0
        ? Math.round((anchorRate / overallRate) * 100) / 100
        : 0;
      return { item, togetherCount, anchorRate, overallRate, lift };
    })
    .sort((a, b) => b.togetherCount - a.togetherCount || b.lift - a.lift)
    .slice(0, 15);

  return {
    anchorKeyword,
    matchedAnchors,
    anchorReceiptCount,
    totalReceiptCount,
    pairs,
  };
}

function analyzeDowItems(
  receipts: Map<string, { date: string; items: Map<string, { qty: number; amount: number }> }>,
): DowItemAnalysis[] {
  const dowReceiptCounts = Array(7).fill(0);
  const dowItemStats: Array<Map<string, { qty: number; amount: number }>> = Array.from({ length: 7 }, () => new Map());

  for (const receipt of receipts.values()) {
    const dateStr = normDateYMD(receipt.date);
    if (!dateStr) continue;
    const dow = new Date(`${dateStr}T12:00:00+09:00`).getDay();
    dowReceiptCounts[dow]++;

    for (const [name, stat] of receipt.items) {
      const map = dowItemStats[dow];
      const cur = map.get(name) || { qty: 0, amount: 0 };
      cur.qty += stat.qty;
      cur.amount += stat.amount;
      map.set(name, cur);
    }
  }

  return DOW_LABELS.map((dow, dowIndex) => {
    const itemMap = dowItemStats[dowIndex];
    const totalQty = [...itemMap.values()].reduce((s, v) => s + v.qty, 0);
    const topItems: DowTopItem[] = [...itemMap.entries()]
      .map(([name, stat]) => ({
        name,
        qty: stat.qty,
        amount: stat.amount,
        share: totalQty > 0 ? Math.round((stat.qty / totalQty) * 1000) / 10 : 0,
      }))
      .sort((a, b) => b.qty - a.qty || b.amount - a.amount)
      .slice(0, 8);

    return {
      dow,
      dowIndex,
      receiptCount: dowReceiptCounts[dowIndex],
      topItems,
    };
  });
}

function popularItemsFromLines(lines: PurchaseLineRow[], limit = 12) {
  const map = new Map<string, { qty: number; amount: number }>();
  for (const line of lines) {
    const cur = map.get(line.goodsName) || { qty: 0, amount: 0 };
    cur.qty += line.saleCount || 1;
    cur.amount += line.totalPrice || 0;
    map.set(line.goodsName, cur);
  }
  return [...map.entries()]
    .map(([name, stat]) => ({ name, ...stat }))
    .sort((a, b) => b.qty - a.qty || b.amount - a.amount)
    .slice(0, limit);
}

export async function computePurchaseAnalytics(
  storeId: string,
  options?: { sinceYmd?: string; anchorKeyword?: string },
): Promise<PurchaseAnalyticsResult> {
  const sinceYmd = options?.sinceYmd || addDaysYMD(getKSTTodayYMD(), -89);
  const anchorKeyword = options?.anchorKeyword ?? '삼겹';

  const lines = await loadPurchaseLines(storeId, sinceYmd);
  const receipts = buildReceiptMap(lines);

  return {
    sinceYmd,
    lineCount: lines.length,
    receiptCount: receipts.size,
    coPurchase: analyzeCoPurchase(receipts, anchorKeyword),
    dowItems: analyzeDowItems(receipts),
    popularItems: popularItemsFromLines(lines),
  };
}
