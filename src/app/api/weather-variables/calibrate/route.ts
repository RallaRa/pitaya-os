import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { adminDb } from '@/lib/firebase/admin';
import { runWeatherItemCalibration } from '@/lib/weatherItemCalibration';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body.storeId || '').trim();
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const force = body.force === true;
    let regionSido: string | undefined;
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      regionSido = snap.data()?.regionSido as string | undefined;
    } catch { /* ignore */ }

    const result = await runWeatherItemCalibration(storeId, {
      regionSido,
      force,
      lookbackDays: body.lookbackDays,
    });

    return NextResponse.json({
      ok: true,
      skipped: result.skipped ?? false,
      reason: result.reason,
      seriesDays: result.seriesDays,
      calibratedAt: result.calibratedAt,
      details: result.details,
      variables: result.variables,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
