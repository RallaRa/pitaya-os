import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildPredictionAnalysisSnapshot } from '@/lib/predictionAnalysis';
import { getKSTYesterdayYMD } from '@/lib/dateUtils';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const targetDate = searchParams.get('date') || getKSTYesterdayYMD();

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const data = await buildPredictionAnalysisSnapshot(storeId, targetDate);
    return NextResponse.json(data);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[prediction-analysis]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
