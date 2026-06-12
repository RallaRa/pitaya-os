export interface KisPortfolio {
  cash: number;
  totalEval: number;
  totalPnl: number;
  totalPnlPct: number;
  holdings: KisHolding[];
}

export interface KisHolding {
  symbol: string;
  name: string;
  qty: number;
  avgPrice: number;
  currentPrice: number;
  pnlPct: number;
  evalAmt: number;
  pnlAmt: number;
}
