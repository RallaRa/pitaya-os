import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { randomUUID } from 'crypto';
import { stockTraderFetch } from '@/lib/stock-trader/client';
import { STOCK_COLLECTIONS, STOCK_STORE_ID } from '@/lib/stock/constants';
import type { StockSettings } from '@/lib/stock/settings.server';
import { recordJournalEntry } from '@/lib/stock/journal.server';
import { ensureStockAlertChannel, postStockAlertText } from '@/lib/stock/messengerAlert.server';
import { saveEngineState } from '@/lib/stock/settings.server';

export interface OrderRecord {
  orderId: string;
  type: 'buy' | 'sell';
  ticker: string;
  name: string;
  price: number;
  quantity: number;
  status: 'filled' | 'pending' | 'failed' | 'paper';
  aiReason: string;
  executedAt: string;
  splitIndex?: number;
  paper: boolean;
  avgPrice?: number;
}

async function notifyTrade(text: string, settings: StockSettings) {
  if (!settings.notifyTrade) return;
  try {
    const roomId = await ensureStockAlertChannel(STOCK_STORE_ID);
    await postStockAlertText({ roomId, text });
  } catch {
    // ignore
  }
}

async function placeKisOrder(params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  paperMode: boolean;
  orderType?: 'market' | 'limit';
  price?: number;
}): Promise<{ ok: boolean; data?: unknown; error?: string }> {
  if (params.paperMode) {
    return { ok: true, data: { mode: 'paper', simulated: true } };
  }
  try {
    const data = await stockTraderFetch('/api/kis/order', {
      method: 'POST',
      body: JSON.stringify({
        symbol: params.symbol,
        qty: params.qty,
        side: params.side,
        orderType: params.orderType || 'market',
        price: params.price,
      }),
    });
    return { ok: true, data };
  } catch (e: unknown) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export async function saveOrder(uid: string, order: OrderRecord) {
  await adminDb.collection(STOCK_COLLECTIONS.orders).doc(order.orderId).set({
    ...order,
    uid,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

export async function executeSplitBuy(params: {
  uid: string;
  settings: StockSettings;
  symbol: string;
  name: string;
  totalAmount: number;
  price: number;
  aiReason: string;
}): Promise<OrderRecord[]> {
  const qtyTotal = Math.max(1, Math.floor(params.totalAmount / params.price));
  const splitQty = Math.max(1, Math.floor(qtyTotal / 3));
  const splits = [
    { idx: 1, offsetPct: 0 },
    { idx: 2, offsetPct: -1 },
    { idx: 3, offsetPct: -2 },
  ];

  const orders: OrderRecord[] = [];

  for (const split of splits) {
    const orderId = randomUUID();
    const execPrice = Math.round(params.price * (1 + split.offsetPct / 100));
    const result = await placeKisOrder({
      symbol: params.symbol,
      qty: splitQty,
      side: 'buy',
      paperMode: params.settings.paperMode,
    });

    const order: OrderRecord = {
      orderId,
      type: 'buy',
      ticker: params.symbol,
      name: params.name,
      price: execPrice,
      quantity: splitQty,
      status: result.ok ? (params.settings.paperMode ? 'paper' : 'filled') : 'failed',
      aiReason: `${params.aiReason} · ${split.idx}차 분할 (${split.offsetPct}%)`,
      executedAt: new Date().toISOString(),
      splitIndex: split.idx,
      paper: params.settings.paperMode,
    };

    await saveOrder(params.uid, order);
    await recordJournalEntry(params.uid, order);
    orders.push(order);

    if (result.ok) {
      await notifyTrade(
        `✅ 자동 매수 ${split.idx}차\n${params.name}(${params.symbol}) ${splitQty}주 @${execPrice.toLocaleString()}원`,
        params.settings,
      );
    }
  }

  await saveEngineState(params.uid, {
    lastTradeAt: new Date().toISOString(),
    lastTradeResult: `매수 ${params.symbol} x${splitQty * 3}`,
  });

  return orders;
}

export async function executeSell(params: {
  uid: string;
  settings: StockSettings;
  symbol: string;
  name: string;
  qty: number;
  price: number;
  avgPrice?: number;
  aiReason: string;
  partial?: boolean;
}): Promise<OrderRecord> {
  const orderId = randomUUID();
  const result = await placeKisOrder({
    symbol: params.symbol,
    qty: params.qty,
    side: 'sell',
    paperMode: params.settings.paperMode,
  });

  const order: OrderRecord = {
    orderId,
    type: 'sell',
    ticker: params.symbol,
    name: params.name,
    price: params.price,
    quantity: params.qty,
    status: result.ok ? (params.settings.paperMode ? 'paper' : 'filled') : 'failed',
    aiReason: params.aiReason,
    executedAt: new Date().toISOString(),
    paper: params.settings.paperMode,
    avgPrice: params.avgPrice,
  };

  await saveOrder(params.uid, order);
  await recordJournalEntry(params.uid, order);

  if (result.ok) {
    const label = params.partial ? '부분 매도' : '매도';
    await notifyTrade(
      `✅ 자동 ${label}\n${params.name}(${params.symbol}) ${params.qty}주`,
      params.settings,
    );
    await saveEngineState(params.uid, {
      lastTradeAt: new Date().toISOString(),
      lastTradeResult: `${label} ${params.symbol}`,
    });
  }

  return order;
}

export async function runAiExecutionCycle(params: {
  uid: string;
  settings: StockSettings;
  topPick?: { symbol: string; name: string; price: number; buyProbability: number };
  aiReason?: string;
  dryRun?: boolean;
}) {
  if (!params.settings.masterEnabled) {
    return { ok: false, error: '마스터 스위치 OFF' };
  }
  if (!params.topPick || params.topPick.buyProbability < 0.6) {
    return { ok: true, action: 'hold', message: '매수 신호 미충족' };
  }
  if (params.dryRun) {
    return { ok: true, action: 'dry_run', pick: params.topPick };
  }

  const amount = Math.min(params.settings.maxOrderAmount, params.settings.maxInvestAmount);
  const orders = await executeSplitBuy({
    uid: params.uid,
    settings: params.settings,
    symbol: params.topPick.symbol,
    name: params.topPick.name,
    totalAmount: amount,
    price: params.topPick.price,
    aiReason: params.aiReason || `팩터 스코어 ${(params.topPick.buyProbability * 100).toFixed(0)}%`,
  });

  return { ok: true, action: 'buy', orders };
}

export async function listRecentOrders(uid: string, limit = 50) {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.orders)
    .where('uid', '==', uid)
    .orderBy('executedAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}
