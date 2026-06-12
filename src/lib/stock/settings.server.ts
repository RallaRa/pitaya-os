import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS } from '@/lib/stock/constants';

export interface StockSettings {
  masterEnabled: boolean;
  maxInvestAmount: number;
  maxOrderAmount: number;
  stopLossPct: number;
  mddLimitPct: number;
  rebalanceDays: number;
  paperMode: boolean;
  notifyTrade: boolean;
  notifyRisk: boolean;
  notifyStrategy: boolean;
  strategyMode?: string;
  chatCashTarget?: number;
  chatEmergencyLiquidate?: boolean;
  factorWeights: {
    momentum: number;
    value: number;
    quality: number;
    lowVol: number;
    flow: number;
  };
}

export const DEFAULT_STOCK_SETTINGS: StockSettings = {
  masterEnabled: false,
  maxInvestAmount: 1_000_000,
  maxOrderAmount: 300_000,
  stopLossPct: 7,
  mddLimitPct: 20,
  rebalanceDays: 30,
  paperMode: false,
  notifyTrade: true,
  notifyRisk: true,
  notifyStrategy: true,
  factorWeights: {
    momentum: 0.3,
    value: 0.2,
    quality: 0.25,
    lowVol: 0.15,
    flow: 0.1,
  },
};

export async function getStockSettings(uid: string): Promise<StockSettings> {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.settings).doc(uid).get();
  if (!snap.exists) return { ...DEFAULT_STOCK_SETTINGS };
  return { ...DEFAULT_STOCK_SETTINGS, ...(snap.data() as Partial<StockSettings>) };
}

export async function saveStockSettings(uid: string, patch: Partial<StockSettings>) {
  await adminDb.collection(STOCK_COLLECTIONS.settings).doc(uid).set({
    ...patch,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getStockPortfolioDoc(uid: string) {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.portfolio).doc(uid).get();
  return snap.exists ? snap.data() : null;
}

export async function saveStockPortfolio(uid: string, data: Record<string, unknown>) {
  await adminDb.collection(STOCK_COLLECTIONS.portfolio).doc(uid).set({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}

export async function getEngineState(uid: string) {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.engineState).doc(uid).get();
  return snap.exists ? snap.data() : null;
}

export async function saveEngineState(uid: string, data: Record<string, unknown>) {
  await adminDb.collection(STOCK_COLLECTIONS.engineState).doc(uid).set({
    ...data,
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });
}
