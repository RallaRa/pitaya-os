/** KIS 시세 파싱 (클라이언트·서버 공용) */

export interface KisQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  open: number;
  high: number;
  low: number;
  prevClose: number;
  volume: number;
  amount: number;
  upperLimit: number;
  lowerLimit: number;
  per: number;
  pbr: number;
  eps: number;
  bps: number;
  marketCap: number;
  high52: number;
  low52: number;
  tradeTime: string;
}

export interface KisCandle {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
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

export interface KisOrderbookLevel {
  bidPrice: number;
  bidQty: number;
  askPrice: number;
  askQty: number;
}

export interface KisOrderbook {
  symbol: string;
  levels: KisOrderbookLevel[];
  totalBidQty: number;
  totalAskQty: number;
}

export interface KisFill {
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  amount: number;
  time: string;
  orderNo: string;
}

export interface KisPendingOrder {
  symbol: string;
  name: string;
  side: 'buy' | 'sell';
  qty: number;
  price: number;
  orderNo: string;
  orgOrderNo: string;
  status: string;
  time: string;
}

export type ChartPeriod = 'D' | 'W' | 'M' | '1' | '3' | '5' | '15' | '30' | '60';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function parseKisQuote(raw: { output?: Record<string, string> }): KisQuote {
  const o = raw.output || {};
  return {
    symbol: String(o.stck_shrn_iscd || '').padStart(6, '0'),
    name: String(o.hts_kor_isnm || ''),
    price: num(o.stck_prpr),
    change: num(o.prdy_vrss),
    changePct: num(o.prdy_ctrt),
    open: num(o.stck_oprc),
    high: num(o.stck_hgpr),
    low: num(o.stck_lwpr),
    prevClose: num(o.stck_prdy_clpr),
    volume: num(o.acml_vol),
    amount: num(o.acml_tr_pbmn),
    upperLimit: num(o.stck_mxpr),
    lowerLimit: num(o.stck_llam),
    per: num(o.per),
    pbr: num(o.pbr),
    eps: num(o.eps),
    bps: num(o.bps),
    marketCap: num(o.hts_avls) * 100000000,
    high52: num(o.w52_hgpr),
    low52: num(o.w52_lwpr),
    tradeTime: String(o.stck_cntg_hour || ''),
  };
}

export function formatChartDate(ymd: string): string {
  if (ymd.length !== 8) return ymd;
  return `${ymd.slice(4, 6)}/${ymd.slice(6, 8)}`;
}

export const POPULAR_SYMBOLS = [
  { symbol: '005930', name: '삼성전자' },
  { symbol: '000660', name: 'SK하이닉스' },
  { symbol: '035420', name: 'NAVER' },
  { symbol: '035720', name: '카카오' },
  { symbol: '005380', name: '현대차' },
  { symbol: '069500', name: 'KODEX 200' },
  { symbol: '051910', name: 'LG화학' },
  { symbol: '006400', name: '삼성SDI' },
] as const;
