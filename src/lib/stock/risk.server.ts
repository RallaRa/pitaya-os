import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { STOCK_COLLECTIONS, STOCK_STORE_ID } from '@/lib/stock/constants';
import type { StockSettings } from '@/lib/stock/settings.server';
import { fetchKisPortfolio } from '@/lib/stock/kisPortfolio.server';
import { executeSell } from '@/lib/stock/execution.server';
import { ensureStockAlertChannel, postStockAlertText } from '@/lib/stock/messengerAlert.server';

export interface RiskSnapshot {
  mddPct: number;
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  beta: number;
  sectorConcentration: number;
  var95: number;
  actions: string[];
  holdingsAtRisk: Array<{ symbol: string; name: string; pnlPct: number; qty: number; currentPrice: number; avgPrice: number }>;
}

function classifyRisk(mdd: number, settings: StockSettings): RiskSnapshot['riskLevel'] {
  const limit = settings.mddLimitPct;
  if (mdd <= -limit) return 'critical';
  if (mdd <= -(limit * 0.75)) return 'high';
  if (mdd <= -(limit * 0.5)) return 'medium';
  return 'low';
}

export async function computeRiskSnapshot(
  settings: StockSettings,
  saved?: Record<string, unknown> | null,
): Promise<RiskSnapshot> {
  let holdings: Array<{ symbol: string; name: string; pnlPct: number; evalAmt: number; qty: number; currentPrice: number; avgPrice: number }> = [];
  let totalEval = 0;

  try {
    const kis = await fetchKisPortfolio();
    holdings = kis.holdings;
    totalEval = kis.totalEval;
  } catch {
    holdings = (saved?.holdings as typeof holdings) || [];
    totalEval = Number(saved?.totalEval) || 0;
  }

  const peak = Number(saved?.peakEval) || totalEval || 1;
  const mddPct = peak > 0 ? ((totalEval - peak) / peak) * 100 : 0;
  const maxWeight = holdings.reduce((m, h) => {
    const w = totalEval > 0 ? h.evalAmt / totalEval : 0;
    return Math.max(m, w);
  }, 0);

  const atRisk = holdings.filter(h => h.pnlPct <= -settings.stopLossPct);
  const actions: string[] = [];

  if (mddPct <= -10) actions.push('MDD -10%: 신규 매수 중단');
  if (mddPct <= -15) actions.push('MDD -15%: 50% 자동 청산 권고');
  if (mddPct <= -20) actions.push('MDD -20%: 전량 청산 + 30일 휴지');

  return {
    mddPct,
    riskLevel: classifyRisk(mddPct, settings),
    beta: 0.95 + maxWeight * 0.3,
    sectorConcentration: maxWeight * 100,
    var95: Math.abs(mddPct) * 1.2,
    actions,
    holdingsAtRisk: atRisk.map(h => ({
      symbol: h.symbol,
      name: h.name,
      pnlPct: h.pnlPct,
      qty: h.qty,
      currentPrice: h.currentPrice,
      avgPrice: h.avgPrice,
    })),
  };
}

export async function applyRiskActions(params: {
  uid: string;
  settings: StockSettings;
  snapshot: RiskSnapshot;
  autoExecute?: boolean;
}) {
  const triggered: string[] = [];

  if (params.snapshot.mddPct <= -15 && params.autoExecute) {
    for (const h of params.snapshot.holdingsAtRisk.slice(0, 3)) {
      const sellQty = Math.max(1, Math.floor(h.qty * 0.5));
      await executeSell({
        uid: params.uid,
        settings: params.settings,
        symbol: h.symbol,
        name: h.name,
        qty: sellQty,
        price: h.currentPrice,
        avgPrice: h.avgPrice,
        aiReason: `리스크 MDD ${params.snapshot.mddPct.toFixed(1)}% 자동 대응 (50% 청산)`,
        partial: true,
      });
      triggered.push(`손절 ${h.symbol} ${sellQty}주`);
    }
  }

  if (params.settings.notifyRisk && triggered.length > 0) {
    try {
      const roomId = await ensureStockAlertChannel(STOCK_STORE_ID);
      await postStockAlertText({
        roomId,
        text: `⚠️ MDD 경고 ${params.snapshot.mddPct.toFixed(1)}%\n${triggered.join('\n')}`,
      });
    } catch {
      // ignore
    }
  }

  await adminDb.collection(STOCK_COLLECTIONS.portfolio).doc(params.uid).set({
    mdd: params.snapshot.mddPct,
    riskLevel: params.snapshot.riskLevel,
    lastRiskCheckAt: new Date().toISOString(),
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return { triggered, snapshot: params.snapshot };
}
