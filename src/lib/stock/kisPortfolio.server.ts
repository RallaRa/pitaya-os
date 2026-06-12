import { stockTraderFetch, getStockTraderConfig, shouldUseLocalKis } from '@/lib/stock-trader/client';
import { isKisDirectConfigured, getKisStatus } from '@/lib/stock/kisConfig.server';
import {
  kisGetBalance,
  parseKisBalance,
} from '@/lib/stock/kis.server';

export interface KisBalanceSummary {
  cash: number;
  totalEval: number;
  holdings: Array<{
    symbol: string;
    name: string;
    qty: number;
    avgPrice: number;
    currentPrice: number;
    pnlPct: number;
    evalAmt: number;
  }>;
  paper: boolean;
  live: boolean;
}

export async function fetchKisPortfolio(): Promise<KisBalanceSummary> {
  if (shouldUseLocalKis()) {
    const status = getKisStatus();
    try {
      const data = await kisGetBalance();
      const parsed = parseKisBalance(data as { output1?: Record<string, string>[]; output2?: Record<string, string>[] });
      return {
        cash: parsed.cash,
        totalEval: parsed.totalEval,
        holdings: parsed.holdings,
        paper: status.paper,
        live: status.live,
      };
    } catch {
      return { cash: 0, totalEval: 0, holdings: [], paper: status.paper, live: status.live };
    }
  }

  const status = await stockTraderFetch<{
    kis: { paper: boolean; live: boolean; configured: boolean };
  }>('/api/status');

  let balanceRaw: Record<string, unknown>;
  try {
    balanceRaw = await stockTraderFetch<{ data: Record<string, unknown> }>('/api/kis/balance');
  } catch {
    return {
      cash: 0,
      totalEval: 0,
      holdings: [],
      paper: status.kis.paper,
      live: status.kis.live,
    };
  }

  const data = (balanceRaw.data || balanceRaw) as {
    output1?: Record<string, string>[];
    output2?: Record<string, string>[];
  };

  const parsed = parseKisBalance(data);
  return {
    cash: parsed.cash,
    totalEval: parsed.totalEval,
    holdings: parsed.holdings,
    paper: status.kis.paper,
    live: status.kis.live,
  };
}

export function isKisConfigured(): boolean {
  return getStockTraderConfig().configured || isKisDirectConfigured();
}
