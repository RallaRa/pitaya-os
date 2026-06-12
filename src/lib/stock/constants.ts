/** AI 완전 자동 주식투자 — 슈퍼유저 전용 상수 */

export const STOCK_SUPERUSER_EMAIL = (
  process.env.STOCK_SUPERUSER_EMAIL ||
  process.env.SUPERUSER_EMAIL ||
  process.env.NEXT_PUBLIC_SUPERUSER_EMAIL ||
  'hipona00@gmail.com'
).toLowerCase();

export const STOCK_STORE_ID = process.env.STOCK_STORE_ID || 'STR-1779194754785';

export const STOCK_BASE_PATH = '/dashboard/superuser/stock';

export const STOCK_API_PREFIX = '/api/stock';

export const STOCK_SESSION_IDLE_MS = 30 * 60 * 1000;

export const STOCK_AUTH_COOKIE = 'pitaya_stock_token';

/** Firestore 컬렉션 (stock_ prefix) */
export const STOCK_COLLECTIONS = {
  portfolio: 'stock_portfolio',
  settings: 'stock_settings',
  orders: 'stock_orders',
  aiLearning: 'stock_ai_learning',
  universe: 'stock_universe',
  scores: 'stock_scores',
  strategyLog: 'stock_strategy_log',
  rebalancing: 'stock_rebalancing',
  aiAnalysis: 'stock_ai_analysis',
  backtest: 'stock_backtest',
  journal: 'stock_journal',
  sessions: 'stock_sessions',
  engineState: 'stock_engine_state',
  chat: 'stock_chat',
} as const;

export const SECURITY_LOGS = 'security_logs';

export const MESSENGER_STOCK_ALERT_CHANNEL = 'stock_alert';
