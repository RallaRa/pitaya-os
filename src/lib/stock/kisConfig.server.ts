/** KIS OpenAPI env (Vercel·로컬 서버 전용 — 클라이언트 노출 금지) */

function parseBool(v: string | undefined, defaultValue: boolean): boolean {
  if (v === undefined || v === null || v.trim() === '') return defaultValue;
  const s = v.trim().toLowerCase();
  if (['false', '0', 'no', 'off'].includes(s)) return false;
  if (['true', '1', 'yes', 'on'].includes(s)) return true;
  return defaultValue;
}

export function getKisEnv() {
  return {
    appKey: process.env.KIS_APP_KEY?.trim() || '',
    appSecret: process.env.KIS_APP_SECRET?.trim() || '',
    accountNo: process.env.KIS_ACCOUNT_NO?.trim() || '',
    isPaper: parseBool(process.env.KIS_IS_PAPER, true),
    liveTrading: parseBool(process.env.LIVE_TRADING, false),
  };
}

export function isKisDirectConfigured(): boolean {
  const e = getKisEnv();
  return !!(e.appKey && e.appSecret && e.accountNo);
}

export function getKisBaseUrl(): string {
  const { isPaper } = getKisEnv();
  return isPaper
    ? 'https://openapivts.koreainvestment.com:29443'
    : 'https://openapi.koreainvestment.com:9443';
}

export function getKisStatus() {
  const e = getKisEnv();
  return {
    configured: isKisDirectConfigured(),
    paper: e.isPaper,
    live: !e.isPaper,
    account: e.accountNo ? e.accountNo.replace(/\d{4}$/, '****') : null,
  };
}

export function getTradingStatus() {
  const e = getKisEnv();
  const warnings: string[] = [];
  const kisLive = !e.isPaper;

  if (kisLive) {
    warnings.push('KIS 실전 계좌 — 실제 원화로 거래됩니다');
    if (!e.liveTrading) {
      warnings.push('주문 차단 중: LIVE_TRADING=true 필요');
    }
  }

  let mode: 'paper' | 'blocked' | 'live' = 'paper';
  if (kisLive && e.liveTrading) mode = 'live';
  else if (kisLive) mode = 'blocked';

  return {
    kis: getKisStatus(),
    alpaca: { configured: false, paper: true },
    liveTradingEnabled: e.liveTrading,
    ordersAllowed: !kisLive || e.liveTrading,
    mode,
    warnings,
  };
}

export function assertKisOrdersAllowed(): void {
  const e = getKisEnv();
  if (!e.isPaper && !e.liveTrading) {
    throw new Error(
      'KIS 실전 모드입니다. Vercel env에 LIVE_TRADING=true 설정 후 재배포하세요.',
    );
  }
}
