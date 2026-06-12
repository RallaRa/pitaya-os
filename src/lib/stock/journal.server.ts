import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS } from '@/lib/stock/constants';
import type { OrderRecord } from '@/lib/stock/execution.server';

export interface JournalEntryDoc {
  id: string;
  type?: string;
  pnlPct?: number | null;
  [key: string]: unknown;
}

export async function recordJournalEntry(uid: string, order: OrderRecord) {
  const tradeId = order.orderId;
  await adminDb.collection(STOCK_COLLECTIONS.journal).doc(tradeId).set({
    tradeId,
    uid,
    symbol: order.ticker,
    name: order.name,
    type: order.type,
    price: order.price,
    quantity: order.quantity,
    status: order.status,
    aiReason: order.aiReason,
    executedAt: order.executedAt,
    paper: order.paper,
    pnlPct: order.type === 'sell' && order.avgPrice && order.avgPrice > 0
      ? ((order.price - order.avgPrice) / order.avgPrice) * 100
      : null,
    holdDays: null,
    aiAccuracy: null,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function listJournalEntries(uid: string, limit = 100) {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.journal)
    .where('uid', '==', uid)
    .orderBy('executedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as JournalEntryDoc));
}

export async function getJournalStats(uid: string) {
  const entries = await listJournalEntries(uid, 200);
  const sells = entries.filter(e => e.type === 'sell');
  const wins = sells.filter(e => Number(e.pnlPct) > 0).length;
  return {
    totalTrades: entries.length,
    sellCount: sells.length,
    winRate: sells.length ? (wins / sells.length) * 100 : 0,
  };
}
