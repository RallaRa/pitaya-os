import type { FactorScoreRow } from '@/lib/stock/factorScoring.server';

export interface BacktestSimResult {
  avgComposite: number;
  top5VirtualReturnPct: number;
  top20: FactorScoreRow[];
  date: string | null;
  strategyMode: string | null;
  count: number;
}

/** buyProbability 기반 Top5 간이 가상 수익률 (%) */
export function computeTop5VirtualReturn(rows: FactorScoreRow[]): number {
  if (!rows.length) return 0;
  const top5 = rows.slice(0, 5);
  return top5.reduce((s, r) => s + (r.buyProbability - 0.5) * 20, 0) / top5.length;
}

export function buildBacktestSim(scoresDoc: Record<string, unknown> | null): BacktestSimResult {
  const top20 = (scoresDoc?.top20 as FactorScoreRow[]) || [];
  const avgComposite = top20.length
    ? top20.reduce((s, r) => s + (r.composite || 0), 0) / top20.length
    : 0;

  return {
    avgComposite,
    top5VirtualReturnPct: computeTop5VirtualReturn(top20),
    top20,
    date: (scoresDoc?.date as string) || null,
    strategyMode: (scoresDoc?.strategyMode as string) || null,
    count: top20.length,
  };
}
