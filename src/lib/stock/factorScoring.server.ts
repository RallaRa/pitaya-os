import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS } from '@/lib/stock/constants';
import type { StockSettings } from '@/lib/stock/settings.server';
import type { UniverseCandidate } from '@/lib/stock/universe.server';
import { computeTop5VirtualReturn } from '@/lib/stock/backtestSim.server';

export interface FactorScoreRow {
  symbol: string;
  name: string;
  price: number;
  momentum: number;
  value: number;
  quality: number;
  lowVol: number;
  flow: number;
  composite: number;
  rank: number;
  buyProbability: number;
}

function hashScore(symbol: string, salt: number): number {
  let h = salt;
  for (let i = 0; i < symbol.length; i += 1) {
    h = (h * 31 + symbol.charCodeAt(i)) % 1000;
  }
  return (h % 70 + 30) / 100;
}

function adjustWeights(
  weights: StockSettings['factorWeights'],
  strategyMode?: string,
): StockSettings['factorWeights'] {
  const w = { ...weights };
  if (strategyMode === 'aggressive' || strategyMode === '상승장') {
    w.momentum = Math.min(0.45, w.momentum + 0.1);
    w.quality = Math.max(0.1, w.quality - 0.05);
  } else if (strategyMode === 'conservative' || strategyMode === '하락장') {
    w.quality = Math.min(0.35, w.quality + 0.1);
    w.lowVol = Math.min(0.25, w.lowVol + 0.05);
    w.momentum = Math.max(0.15, w.momentum - 0.1);
  } else if (strategyMode === '횡보장') {
    w.value = Math.min(0.35, w.value + 0.1);
  }
  const sum = w.momentum + w.value + w.quality + w.lowVol + w.flow;
  return {
    momentum: w.momentum / sum,
    value: w.value / sum,
    quality: w.quality / sum,
    lowVol: w.lowVol / sum,
    flow: w.flow / sum,
  };
}

export function computeFactorScores(
  passed: UniverseCandidate[],
  settings: StockSettings,
  strategyMode?: string,
): FactorScoreRow[] {
  const weights = adjustWeights(settings.factorWeights, strategyMode);

  const rows = passed.map(c => {
    const momentum = Math.min(100, Math.max(0, 50 + (c.changePct ?? 0) * 5));
    const value = c.per && c.per > 0 ? Math.min(100, Math.max(20, 100 - c.per * 3)) : hashScore(c.symbol, 2) * 100;
    const quality = hashScore(c.symbol, 3) * 100;
    const lowVol = hashScore(c.symbol, 4) * 100;
    const flow = Math.min(100, (c.volumeProxy / 1_000_000_000) * 10);
    const composite =
      momentum * weights.momentum +
      value * weights.value +
      quality * weights.quality +
      lowVol * weights.lowVol +
      flow * weights.flow;

    return {
      symbol: c.symbol,
      name: c.name,
      price: c.price,
      momentum,
      value,
      quality,
      lowVol,
      flow,
      composite,
      rank: 0,
      buyProbability: Math.min(0.95, composite / 100),
    };
  });

  rows.sort((a, b) => b.composite - a.composite);
  rows.forEach((r, i) => { r.rank = i + 1; });
  return rows.slice(0, 20);
}

export async function saveFactorScores(
  uid: string,
  rows: FactorScoreRow[],
  weights: StockSettings['factorWeights'],
  strategyMode?: string,
) {
  const date = new Date().toISOString().slice(0, 10);
  const avgComposite = rows.length
    ? rows.reduce((s, r) => s + r.composite, 0) / rows.length
    : 0;
  const top5VirtualReturnPct = computeTop5VirtualReturn(rows);

  await adminDb.collection(STOCK_COLLECTIONS.scores).doc(date).set({
    date,
    uid,
    top20: rows,
    weights,
    strategyMode: strategyMode ?? 'balanced',
    updatedAt: FieldValue.serverTimestamp(),
  });

  await adminDb.collection(STOCK_COLLECTIONS.backtest).doc(date).set({
    date,
    uid,
    top20: rows,
    avgComposite,
    top5VirtualReturnPct,
    strategyMode: strategyMode ?? 'balanced',
    count: rows.length,
    note: 'buyProbability 기반 간이 추정',
    updatedAt: FieldValue.serverTimestamp(),
  });

  return date;
}

export async function getLatestScores() {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.scores)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data();
}
