import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { stockTraderFetch } from '@/lib/stock-trader/client';
import { STOCK_COLLECTIONS } from '@/lib/stock/constants';
import type { StockSettings } from '@/lib/stock/settings.server';

export interface UniverseCandidate {
  symbol: string;
  name: string;
  price: number;
  volumeProxy: number;
  marketCapProxy: number;
  changePct?: number;
  per?: number;
  passed: boolean;
  reasons: string[];
}

export interface UniverseFilterConfig {
  minMarketCap: number;
  minDailyVolume: number;
  minListingDays: number;
  maxDebtRatio: number;
  requireProfit: boolean;
}

export const DEFAULT_UNIVERSE_SYMBOLS: Array<{ symbol: string; name: string; capB: number }> = [
  { symbol: '005930', name: '삼성전자', capB: 400 },
  { symbol: '000660', name: 'SK하이닉스', capB: 120 },
  { symbol: '035420', name: 'NAVER', capB: 35 },
  { symbol: '051910', name: 'LG화학', capB: 30 },
  { symbol: '006400', name: '삼성SDI', capB: 25 },
  { symbol: '035720', name: '카카오', capB: 20 },
  { symbol: '005380', name: '현대차', capB: 45 },
  { symbol: '105560', name: 'KB금융', capB: 25 },
  { symbol: '055550', name: '신한지주', capB: 22 },
  { symbol: '068270', name: '셀트리온', capB: 40 },
  { symbol: '028260', name: '삼성물산', capB: 18 },
  { symbol: '012330', name: '현대모비스', capB: 28 },
  { symbol: '066570', name: 'LG전자', capB: 15 },
  { symbol: '003550', name: 'LG', capB: 12 },
  { symbol: '032830', name: '삼성생명', capB: 14 },
];

function todayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function regimeAdjustments(strategyMode?: string): Partial<UniverseFilterConfig> {
  if (strategyMode === 'aggressive' || strategyMode === '상승장') {
    return { minMarketCap: 300, minDailyVolume: 5 };
  }
  if (strategyMode === 'conservative' || strategyMode === '하락장') {
    return { minMarketCap: 1000, minDailyVolume: 30, maxDebtRatio: 150 };
  }
  return {};
}

async function fetchSymbolQuote(symbol: string): Promise<{
  name: string;
  price: number;
  volume: number;
  changePct: number;
  per: number;
} | null> {
  try {
    const res = await stockTraderFetch<{
      data?: { output?: Record<string, string> };
      quote?: { name: string; price: number; amount: number; volume: number; changePct: number; per: number };
    }>(`/api/kis/price/${symbol}`);

    if (res.quote?.price && res.quote.price > 0) {
      return {
        name: res.quote.name || symbol,
        price: res.quote.price,
        volume: res.quote.amount || res.quote.volume * res.quote.price,
        changePct: res.quote.changePct || 0,
        per: res.quote.per || 0,
      };
    }

    const out = res.data?.output || {};
    const price = num(out.stck_prpr);
    if (price <= 0) return null;
    return {
      name: String(out.hts_kor_isnm || symbol),
      price,
      volume: num(out.acml_tr_pbmn) || num(out.acml_vol) * price,
      changePct: num(out.prdy_ctrt),
      per: num(out.per),
    };
  } catch {
    return null;
  }
}

export function buildUniverseFilters(
  settings: StockSettings,
  strategyMode?: string,
): UniverseFilterConfig {
  const base: UniverseFilterConfig = {
    minMarketCap: 500,
    minDailyVolume: 10,
    minListingDays: 365,
    maxDebtRatio: 200,
    requireProfit: true,
  };
  return { ...base, ...regimeAdjustments(strategyMode) };
}

export async function runUniverseFilter(
  settings: StockSettings,
  strategyMode?: string,
): Promise<{ date: string; filters: UniverseFilterConfig; candidates: UniverseCandidate[]; passed: UniverseCandidate[] }> {
  const filters = buildUniverseFilters(settings, strategyMode);
  const candidates: UniverseCandidate[] = [];

  const quoteResults = await Promise.all(
    DEFAULT_UNIVERSE_SYMBOLS.map(async seed => ({
      seed,
      quote: await fetchSymbolQuote(seed.symbol),
    })),
  );

  for (const { seed, quote } of quoteResults) {
    const price = quote?.price ?? 0;
    const name = quote?.name ?? seed.name;
    const volumeProxy = quote?.volume ?? 0;
    const marketCapProxy = seed.capB * 1_000_000_000;

    const reasons: string[] = [];
    let passed = true;

    if (price <= 0) {
      passed = false;
      reasons.push('시세 조회 실패');
    }
    if (marketCapProxy < filters.minMarketCap * 100_000_000) {
      passed = false;
      reasons.push(`시가총액 ${filters.minMarketCap}억 미만`);
    }
    if (volumeProxy > 0 && volumeProxy < filters.minDailyVolume * 100_000_000) {
      passed = false;
      reasons.push(`거래대금 ${filters.minDailyVolume}억 미만`);
    }

    candidates.push({
      symbol: seed.symbol,
      name,
      price: price || seed.capB * 1000,
      volumeProxy: volumeProxy || filters.minDailyVolume * 100_000_000,
      marketCapProxy,
      changePct: quote?.changePct,
      per: quote?.per,
      passed: quote ? passed : false,
      reasons: quote ? (passed ? ['필터 통과'] : reasons) : ['KIS 시세 없음'],
    });
  }

  const liveQuotes = candidates.filter(c => c.changePct !== undefined).length;
  if (liveQuotes === 0 && candidates.length > 0) {
    for (const c of candidates) {
      c.passed = true;
      c.reasons = ['장외/휴장 — 시드 유니버스 스캔'];
    }
  }

  const passedList = candidates.filter(c => c.passed);
  const date = todayKey();

  await adminDb.collection(STOCK_COLLECTIONS.universe).doc(date).set({
    date,
    filters,
    strategyMode: strategyMode ?? 'balanced',
    candidates,
    passedSymbols: passedList.map(c => c.symbol),
    count: passedList.length,
    updatedAt: FieldValue.serverTimestamp(),
  });

  return { date, filters, candidates, passed: passedList };
}

export async function getLatestUniverse() {
  const snap = await adminDb.collection(STOCK_COLLECTIONS.universe)
    .orderBy('updatedAt', 'desc')
    .limit(1)
    .get();
  return snap.empty ? null : snap.docs[0].data();
}
