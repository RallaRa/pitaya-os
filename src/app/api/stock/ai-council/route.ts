import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';

export const dynamic = 'force-dynamic';

const PROVIDERS = [
  { id: 'gemini', label: 'Gemini 2.5 Flash' },
  { id: 'claude', label: 'Claude Sonnet' },
  { id: 'gpt4o', label: 'GPT-4o' },
  { id: 'groq', label: 'Groq' },
];

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const uid = auth.user.uid;
  const [weightsSnap, engineSnap, ...statSnaps] = await Promise.all([
    adminDb.collection('stock_ai_weights').doc(uid).get(),
    adminDb.collection('stock_engine_state').doc(uid).get(),
    ...PROVIDERS.map(p => adminDb.collection('stock_ai_provider_stats').doc(p.id).get()),
  ]);

  const weights = weightsSnap.data()?.weights || {
    gemini: 0.25,
    claude: 0.25,
    gpt4o: 0.25,
    groq: 0.25,
  };

  const providers = PROVIDERS.map((p, i) => {
    const stat = statSnaps[i].data();
    const errorRate = stat?.total ? (stat.errors || 0) / stat.total : 0;
    let state: 'ok' | 'error' | 'excluded' | 'disabled' = 'ok';
    if (stat?.disabled) state = 'excluded';
    else if (errorRate > 0.3) state = 'error';
    return {
      ...p,
      weight: weights[p.id] ?? 0.25,
      errorRate,
      state,
      total: stat?.total ?? 0,
    };
  });

  const engine = engineSnap.data();

  return NextResponse.json({
    ok: true,
    providers,
    weights,
    engine: engine ? {
      heartbeatAt: engine.heartbeatAt,
      autoTrade: engine.autoTrade,
      networkOnline: engine.networkOnline,
      pausedForPos: engine.pausedForPos,
      marketOpen: engine.marketOpen,
      regime: engine.regime,
      statusMessage: engine.statusMessage,
      lastJobName: engine.lastJobName,
      lastJobAt: engine.lastJobAt,
      engineStartedAt: engine.engineStartedAt,
      top20Count: engine.top20Count,
      riskBlocked: engine.riskBlocked,
    } : null,
  });
}
