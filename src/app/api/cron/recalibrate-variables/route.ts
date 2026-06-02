import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { runWeatherItemCalibration } from '@/lib/weatherItemCalibration';

export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const varsSnap = await adminDb.collection('weather_impact_variables').get();
    let recalibrated = 0;
    const results: Array<{ storeId: string; seriesDays: number; skipped?: boolean }> = [];

    for (const doc of varsSnap.docs) {
      const storeId = doc.id;
      if (!storeId || storeId === 'global') continue;

      let regionSido: string | undefined;
      try {
        const storeSnap = await adminDb.collection('stores').doc(storeId).get();
        regionSido = storeSnap.data()?.regionSido as string | undefined;
      } catch { /* ignore */ }

      const result = await runWeatherItemCalibration(storeId, { regionSido, force: false });
      results.push({ storeId, seriesDays: result.seriesDays, skipped: result.skipped });
      if (!result.skipped && result.seriesDays >= 20) recalibrated++;
    }

    return NextResponse.json({ ok: true, recalibrated, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
