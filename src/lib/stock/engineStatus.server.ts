/** POS PitayaTrader + Vercel 클라우드 엔진 런타임 상태 */

const HEARTBEAT_ONLINE_MS = 6 * 60 * 1000; // heartbeat 5분 주기 + 여유
const RECENT_ACTIVITY_MS = 15 * 60 * 1000;

export type EngineRuntimePhase =
  | 'disabled'
  | 'offline'
  | 'standby'
  | 'active'
  | 'paused'
  | 'warning';

export interface EngineRuntimeStatus {
  phase: EngineRuntimePhase;
  label: string;
  detail: string;
  masterEnabled: boolean;
  posOnline: boolean;
  posAutoTrade: boolean;
  marketOpen: boolean;
  networkOnline: boolean;
  pausedForPos: boolean;
  heartbeatAt: string | null;
  heartbeatAgeSec: number | null;
  lastScanAt: string | null;
  lastMarketRegime: string | null;
  nextAction: string;
  checklist: Array<{ ok: boolean; label: string; hint?: string }>;
}

function parseTs(v: unknown): number | null {
  if (!v) return null;
  const t = new Date(String(v)).getTime();
  return Number.isFinite(t) ? t : null;
}

export function isKstMarketOpen(now = new Date()): boolean {
  const kst = new Date(now.toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
  const day = kst.getDay();
  if (day === 0 || day === 6) return false;
  const mins = kst.getHours() * 60 + kst.getMinutes();
  return mins >= 9 * 60 && mins < 15 * 60 + 30;
}

function formatAge(sec: number | null): string {
  if (sec == null) return '없음';
  if (sec < 60) return `${sec}초 전`;
  if (sec < 3600) return `${Math.floor(sec / 60)}분 전`;
  return `${Math.floor(sec / 3600)}시간 전`;
}

export function buildEngineRuntimeStatus(input: {
  masterEnabled: boolean;
  engine?: Record<string, unknown> | null;
  lastScanAt?: string | null;
  lastMarketRegime?: string | null;
  kisConfigured?: boolean;
}): EngineRuntimeStatus {
  const now = Date.now();
  const engine = input.engine || {};
  const heartbeatAt = (engine.heartbeatAt as string) || null;
  const hbTs = parseTs(heartbeatAt);
  const heartbeatAgeSec = hbTs ? Math.floor((now - hbTs) / 1000) : null;
  const posOnline = hbTs != null && now - hbTs <= HEARTBEAT_ONLINE_MS;

  const posAutoTrade = engine.autoTrade !== false;
  const marketOpen = engine.marketOpen === true || isKstMarketOpen();
  const networkOnline = engine.networkOnline !== false;
  const pausedForPos = engine.pausedForPos === true;
  const lastScanTs = parseTs(input.lastScanAt);
  const recentCloudActivity = lastScanTs != null && now - lastScanTs <= RECENT_ACTIVITY_MS;

  const checklist = [
    {
      ok: input.masterEnabled,
      label: '마스터 ON',
      hint: input.masterEnabled ? undefined : '상단 AI ON 버튼을 눌러 활성화',
    },
    {
      ok: posOnline,
      label: 'POS 엔진 연결',
      hint: posOnline ? undefined : 'C:\\pitaya-trader 에서 pm2 start ecosystem.config.js',
    },
    {
      ok: input.kisConfigured !== false,
      label: 'KIS 연동',
      hint: 'Vercel/POS env에 KIS 키 설정',
    },
    {
      ok: networkOnline,
      label: '네트워크',
      hint: 'POS PC 네트워크 확인',
    },
    {
      ok: !pausedForPos,
      label: 'POS 부하 정상',
      hint: '결제 CPU 과부하 시 5분 일시정지',
    },
    {
      ok: marketOpen || !input.masterEnabled,
      label: marketOpen ? '장중' : '장외 (대기)',
      hint: marketOpen ? undefined : '09:00~15:30 장중에 매매 사이클 실행',
    },
  ];

  let phase: EngineRuntimePhase = 'disabled';
  let label = 'AI OFF';
  let detail = '마스터 스위치가 꺼져 있습니다.';
  let nextAction = 'AI ON 버튼으로 자동매매를 시작하세요.';

  if (input.masterEnabled) {
    if (!posOnline && !recentCloudActivity) {
      phase = 'offline';
      label = '연결 없음';
      detail = '마스터 ON이지만 POS 엔진 heartbeat가 없습니다. PM2가 실행 중인지 확인하세요.';
      nextAction = 'POS PC: pm2 list → PitayaTrader online 확인';
    } else if (pausedForPos || !networkOnline || !posAutoTrade) {
      phase = 'paused';
      label = '일시 정지';
      if (pausedForPos) detail = 'POS 결제/CPU 부하로 매매 엔진이 일시 정지되었습니다.';
      else if (!networkOnline) detail = '네트워크 끊김 — 신규 주문 중단 중';
      else detail = 'AUTO_TRADE 비활성 — 설정 동기화 대기';
      nextAction = '정상화 후 자동 재개됩니다';
    } else if (marketOpen && (posOnline || recentCloudActivity)) {
      phase = 'active';
      label = '실행 중';
      detail = posOnline
        ? 'POS PitayaTrader가 장중 매매 사이클을 모니터링 중입니다.'
        : 'Vercel 클라우드 스캔/실행이 동작 중입니다 (POS 미연결).';
      nextAction = '5분마다 시장 스캔 · AI 판단 · 리스크 체크';
    } else {
      phase = 'standby';
      label = '대기 중';
      detail = posOnline
        ? 'POS 엔진 연결됨 — 장외 시간 heartbeat 유지 중'
        : '장외 시간 — 다음 장 시작(09:00)까지 대기';
      nextAction = marketOpen ? '장중 사이클 시작 대기' : '08:30 시장 브리핑 · 09:00 장 시작';
    }

    if (!posOnline && recentCloudActivity) {
      phase = 'warning';
      label = '클라우드만 동작';
      detail = 'Vercel Cron/수동 스캔은 동작 중이나 POS PitayaTrader 미연결 — 실제 주문은 POS 필요';
      nextAction = 'POS PC PM2 기동 권장';
    }
  }

  return {
    phase,
    label,
    detail,
    masterEnabled: input.masterEnabled,
    posOnline,
    posAutoTrade,
    marketOpen,
    networkOnline,
    pausedForPos,
    heartbeatAt,
    heartbeatAgeSec,
    lastScanAt: input.lastScanAt ?? null,
    lastMarketRegime: input.lastMarketRegime ?? (engine.regime as string) ?? null,
    nextAction,
    checklist,
  };
}

export function runtimePhaseColor(phase: EngineRuntimePhase): string {
  switch (phase) {
    case 'active': return 'teal';
    case 'standby': return 'blue';
    case 'paused': return 'amber';
    case 'warning': return 'orange';
    case 'offline': return 'red';
    default: return 'slate';
  }
}

export { formatAge };
