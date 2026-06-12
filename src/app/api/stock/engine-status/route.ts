import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getEngineState, getStockSettings } from '@/lib/stock/settings.server';
import { buildEngineRuntimeStatus } from '@/lib/stock/engineStatus.server';
import { isKisConfigured } from '@/lib/stock/kisPortfolio.server';

export const dynamic = 'force-dynamic';

function todayKey() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' });
}

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const uid = auth.user.uid;
  const date = todayKey();

  const [settings, engine, marketSnap, scoresSnap, analysisSnap] = await Promise.all([
    getStockSettings(uid),
    getEngineState(uid),
    adminDb.collection('stock_market').doc(date).get(),
    adminDb.collection('stock_scores').doc(date).get(),
    adminDb.collection('stock_ai_analysis').doc(date).get(),
  ]);

  const lastScanAt =
    (scoresSnap.data()?.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.()
    || scoresSnap.data()?.date as string
    || (analysisSnap.data()?.updatedAt as { toDate?: () => Date })?.toDate?.()?.toISOString?.()
    || null;

  const runtime = buildEngineRuntimeStatus({
    masterEnabled: settings.masterEnabled,
    engine: engine as Record<string, unknown> | null,
    lastScanAt,
    lastMarketRegime: marketSnap.data()?.regime as string | null,
    kisConfigured: isKisConfigured(),
  });

  return NextResponse.json({
    ok: true,
    runtime,
    engine,
    settings: { masterEnabled: settings.masterEnabled },
    serverTime: new Date().toISOString(),
  });
}
