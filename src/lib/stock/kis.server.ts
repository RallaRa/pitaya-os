import {
  assertKisOrdersAllowed,
  getKisBaseUrl,
  getKisEnv,
  isKisDirectConfigured,
} from '@/lib/stock/kisConfig.server';

interface KisTokenCache {
  accessToken: string;
  expiresAt: number;
}

let cache: KisTokenCache | null = null;

async function fetchKisToken(): Promise<string> {
  if (cache && Date.now() < cache.expiresAt - 60_000) {
    return cache.accessToken;
  }

  const { appKey, appSecret } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();

  const res = await fetch(`${KIS_BASE}/oauth2/tokenP`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      grant_type: 'client_credentials',
      appkey: appKey,
      appsecret: appSecret,
    }),
  });

  const data = await res.json() as {
    access_token?: string;
    msg1?: string;
  };

  if (!res.ok || !data.access_token) {
    throw new Error(data.msg1 || `KIS token failed: ${res.status}`);
  }

  cache = {
    accessToken: data.access_token,
    expiresAt: Date.now() + 23 * 60 * 60 * 1000,
  };
  return data.access_token;
}

function parseAccount() {
  const { accountNo } = getKisEnv();
  const [cano, acntPrdtCd] = (accountNo || '').split('-');
  if (!cano || !acntPrdtCd) throw new Error('KIS_ACCOUNT_NO 형식: 12345678-01');
  return { cano, acntPrdtCd };
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function formatYmd(d: Date): string {
  return d.toISOString().slice(0, 10).replace(/-/g, '');
}

export async function kisGetBalance() {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');

  const token = await fetchKisToken();
  const { cano, acntPrdtCd } = parseAccount();
  const { appKey, appSecret, isPaper } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();
  const trId = isPaper ? 'VTTC8434R' : 'TTTC8434R';

  const qs = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    AFHR_FLPR_YN: 'N',
    OFL_YN: '',
    INQR_DVSN: '02',
    UNPR_DVSN: '01',
    FUND_STTL_ICLD_YN: 'N',
    FNCG_AMT_AUTO_RDPT_YN: 'N',
    PRCS_DVSN: '01',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/trading/inquire-balance?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: trId,
      },
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function kisGetPrice(symbol: string) {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');

  const token = await fetchKisToken();
  const { appKey, appSecret } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();

  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: symbol.padStart(6, '0'),
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-price?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST01010100',
      },
    },
  );

  const data = await res.json();
  if (!res.ok) throw new Error(JSON.stringify(data));
  return data;
}

export async function kisGetDailyChart(symbol: string, days = 90) {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');

  const token = await fetchKisToken();
  const { appKey, appSecret } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - Math.min(Math.max(days, 7), 100));

  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: symbol.padStart(6, '0'),
    FID_INPUT_DATE_1: formatYmd(start),
    FID_INPUT_DATE_2: formatYmd(end),
    FID_PERIOD_DIV_CODE: 'D',
    FID_ORG_ADJ_PRC: '0',
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-daily-itemchartprice?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST03010100',
      },
    },
  );

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    const msg = (data as { msg1?: string }).msg1 || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

export function parseKisQuote(raw: { output?: Record<string, string> }) {
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
    tradeTime: o.stck_cntg_hour || '',
  };
}

export function parseKisDailyChart(raw: { output2?: Record<string, string>[] }) {
  const rows = raw.output2 || [];
  return rows
    .map(r => ({
      date: String(r.stck_bsop_date || ''),
      open: num(r.stck_oprc),
      high: num(r.stck_hgpr),
      low: num(r.stck_lwpr),
      close: num(r.stck_clpr),
      volume: num(r.acml_vol),
    }))
    .filter(r => r.date && r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

export function parseKisBalance(raw: {
  output1?: Record<string, string>[];
  output2?: Record<string, string>[];
}) {
  const o2 = (raw.output2 || [])[0] || {};
  const holdings = (raw.output1 || []).map(row => {
    const avg = num(row.pchs_avg_pric);
    const cur = num(row.prpr);
    return {
      symbol: String(row.pdno || ''),
      name: String(row.prdt_name || row.pdno || ''),
      qty: num(row.hldg_qty),
      avgPrice: avg,
      currentPrice: cur,
      pnlPct: avg > 0 ? ((cur - avg) / avg) * 100 : 0,
      evalAmt: num(row.evlu_amt),
      pnlAmt: num(row.evlu_pfls_amt),
    };
  }).filter(h => h.qty > 0);

  return {
    cash: num(o2.dnca_tot_amt),
    totalEval: num(o2.tot_evlu_amt) || num(o2.nass_amt),
    totalPnl: num(o2.evlu_pfls_smtl_amt),
    totalPnlPct: num(o2.evlu_erng_rt),
    holdings,
  };
}

export async function kisPlaceOrder(params: {
  symbol: string;
  qty: number;
  side: 'buy' | 'sell';
  orderType?: 'market' | 'limit';
  price?: number;
}) {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  assertKisOrdersAllowed();

  const token = await fetchKisToken();
  const { cano, acntPrdtCd } = parseAccount();
  const { appKey, appSecret, isPaper } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();
  const isBuy = params.side === 'buy';
  const isLimit = params.orderType === 'limit' && (params.price ?? 0) > 0;

  const trId = isPaper
    ? (isBuy ? 'VTTC0802U' : 'VTTC0801U')
    : (isBuy ? 'TTTC0802U' : 'TTTC0801U');

  const body = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    PDNO: params.symbol.padStart(6, '0'),
    ORD_DVSN: isLimit ? '00' : '01',
    ORD_QTY: String(params.qty),
    ORD_UNPR: isLimit ? String(Math.round(params.price!)) : '0',
  };

  const res = await fetch(`${KIS_BASE}/uapi/domestic-stock/v1/trading/order-cash`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    const msg = (data as { msg1?: string }).msg1 || JSON.stringify(data);
    throw new Error(msg);
  }
  return data;
}

function accountQueryBase() {
  const { cano, acntPrdtCd } = parseAccount();
  return { cano, acntPrdtCd };
}

/** 호가창 (10단) */
export async function kisGetOrderbook(symbol: string) {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  const token = await fetchKisToken();
  const { appKey, appSecret } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();

  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: symbol.padStart(6, '0'),
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-asking-price-exp-ccn?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST01010200',
      },
    },
  );

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    throw new Error((data as { msg1?: string }).msg1 || JSON.stringify(data));
  }
  return data;
}

export function parseKisOrderbook(raw: { output1?: Record<string, string> }) {
  const o = raw.output1 || {};
  const levels: Array<{ bidPrice: number; bidQty: number; askPrice: number; askQty: number }> = [];
  for (let i = 1; i <= 10; i++) {
    levels.push({
      bidPrice: num(o[`bidp${i}`]),
      bidQty: num(o[`bidp_rsqn${i}`]),
      askPrice: num(o[`askp${i}`]),
      askQty: num(o[`askp_rsqn${i}`]),
    });
  }
  return {
    symbol: String(o.hts_kor_isnm ? '' : '').padStart(6, '0'),
    levels: levels.filter(l => l.bidPrice > 0 || l.askPrice > 0),
    totalBidQty: num(o.total_bidp_rsqn),
    totalAskQty: num(o.total_askp_rsqn),
  };
}

/** 분봉/일봉 차트 (period: D=일, 1/5/15/30/60=분) */
export async function kisGetTimeChart(symbol: string, period: string = 'D') {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  const token = await fetchKisToken();
  const { appKey, appSecret } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();
  const now = new Date();
  const fmtDate = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '');

  if (period === 'D' || period === 'W' || period === 'M') {
    return kisGetDailyChart(symbol, period === 'W' ? 180 : period === 'M' ? 365 : 90);
  }

  const qs = new URLSearchParams({
    FID_COND_MRKT_DIV_CODE: 'J',
    FID_INPUT_ISCD: symbol.padStart(6, '0'),
    FID_INPUT_DATE_1: fmtDate(now),
    FID_INPUT_HOUR_1: '090000',
    FID_PW_DATA_INCU_YN: 'Y',
    FID_FAKE_TICK_INCU_YN: 'N',
    FID_PERIOD_DIV_CODE: period,
  });

  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/quotations/inquire-time-itemchartprice?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: 'FHKST03010200',
      },
    },
  );

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    throw new Error((data as { msg1?: string }).msg1 || JSON.stringify(data));
  }
  return data;
}

export function parseKisTimeChart(raw: { output2?: Record<string, string>[] }) {
  const rows = raw.output2 || [];
  return rows
    .map(r => ({
      date: String(r.stck_bsop_date || r.stck_cntg_hour || ''),
      open: num(r.stck_oprc),
      high: num(r.stck_hgpr),
      low: num(r.stck_lwpr),
      close: num(r.stck_prpr || r.stck_clpr),
      volume: num(r.cntg_vol || r.acml_vol),
    }))
    .filter(r => r.close > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** 당일 체결내역 */
export async function kisGetDailyFills() {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  const token = await fetchKisToken();
  const { cano, acntPrdtCd } = accountQueryBase();
  const { appKey, appSecret, isPaper } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();
  const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');

  const qs = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    INQR_STRT_DT: today,
    INQR_END_DT: today,
    SLL_BUY_DVSN_CD: '00',
    INQR_DVSN: '00',
    PDNO: '',
    CCLD_DVSN: '00',
    INQR_DVSN_3: '00',
    EXCG_ID_DVSN_CD: 'KRX',
    SRT_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  });

  const trId = isPaper ? 'VTTC8001R' : 'TTTC8001R';
  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/trading/inquire-daily-ccld?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: trId,
      },
    },
  );

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    throw new Error((data as { msg1?: string }).msg1 || JSON.stringify(data));
  }
  return data;
}

export function parseKisDailyFills(raw: { output1?: Record<string, string>[] }) {
  return (raw.output1 || []).map(row => ({
    symbol: String(row.pdno || ''),
    name: String(row.prdt_name || row.pdno || ''),
    side: String(row.sll_buy_dvsn_cd) === '01' ? 'sell' as const : 'buy' as const,
    qty: num(row.tot_ccld_qty || row.ccld_qty),
    price: num(row.avg_prvs || row.ccld_unpr),
    amount: num(row.tot_ccld_amt),
    time: String(row.ord_tmd || row.ccld_tmd || ''),
    orderNo: String(row.odno || ''),
  })).filter(f => f.qty > 0);
}

/** 미체결 주문 */
export async function kisGetPendingOrders() {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  const token = await fetchKisToken();
  const { cano, acntPrdtCd } = accountQueryBase();
  const { appKey, appSecret, isPaper } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();

  const qs = new URLSearchParams({
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    INQR_DVSN: '00',
    CTX_AREA_FK100: '',
    CTX_AREA_NK100: '',
  });

  const trId = isPaper ? 'VTTC8036R' : 'TTTC8036R';
  const res = await fetch(
    `${KIS_BASE}/uapi/domestic-stock/v1/trading/inquire-nccs?${qs}`,
    {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        authorization: `Bearer ${token}`,
        appkey: appKey,
        appsecret: appSecret,
        tr_id: trId,
      },
    },
  );

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    throw new Error((data as { msg1?: string }).msg1 || JSON.stringify(data));
  }
  return data;
}

export function parseKisPendingOrders(raw: { output1?: Record<string, string>[] }) {
  return (raw.output1 || []).map(row => ({
    symbol: String(row.pdno || ''),
    name: String(row.prdt_name || row.pdno || ''),
    side: String(row.sll_buy_dvsn_cd) === '01' ? 'sell' as const : 'buy' as const,
    qty: num(row.nccs_qty || row.ord_qty),
    price: num(row.ord_unpr),
    orderNo: String(row.odno || ''),
    orgOrderNo: String(row.orgn_odno || row.odno || ''),
    status: String(row.ord_dvsn_name || '미체결'),
    time: String(row.ord_tmd || ''),
  })).filter(o => o.qty > 0);
}

/** 주문 취소 */
export async function kisCancelOrder(params: {
  symbol: string;
  qty: number;
  orderNo: string;
  orgOrderNo: string;
}) {
  if (!isKisDirectConfigured()) throw new Error('KIS credentials not configured');
  assertKisOrdersAllowed();

  const token = await fetchKisToken();
  const { cano, acntPrdtCd } = parseAccount();
  const { appKey, appSecret, isPaper } = getKisEnv();
  const KIS_BASE = getKisBaseUrl();

  const body = {
    CANO: cano,
    ACNT_PRDT_CD: acntPrdtCd,
    KRX_FWDG_ORD_ORGNO: '',
    ORGN_ODNO: params.orgOrderNo,
    ORD_DVSN: '00',
    RVSE_CNCL_DVSN_CD: '02',
    ORD_QTY: String(params.qty),
    ORD_UNPR: '0',
    QTY_ALL_ORD_YN: 'Y',
    PDNO: params.symbol.padStart(6, '0'),
  };

  const trId = isPaper ? 'VTTC0803U' : 'TTTC0803U';
  const res = await fetch(`${KIS_BASE}/uapi/domestic-stock/v1/trading/order-rvsecncl`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      authorization: `Bearer ${token}`,
      appkey: appKey,
      appsecret: appSecret,
      tr_id: trId,
    },
    body: JSON.stringify(body),
  });

  const data = await res.json();
  if (!res.ok || (data as { rt_cd?: string }).rt_cd === '1') {
    throw new Error((data as { msg1?: string }).msg1 || JSON.stringify(data));
  }
  return data;
}
