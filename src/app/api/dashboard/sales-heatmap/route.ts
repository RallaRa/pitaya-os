import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildCellDetail, computeSalesHeatmap } from '@/lib/salesHeatmap';
import type { HeatmapRange } from '@/lib/salesHeatmapCalc';

const VALID_RANGES = new Set<HeatmapRange>(['1m', '3m', '6m']);

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const rangeRaw = (searchParams.get('range') || '1m') as HeatmapRange;
  const range = VALID_RANGES.has(rangeRaw) ? rangeRaw : '1m';
  const dowParam = searchParams.get('dow');
  const hourParam = searchParams.get('hour');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const result = await computeSalesHeatmap(storeId, range);

    const { peakByCell, ...payload } = result;

    if (dowParam != null && hourParam != null) {
      const dow = Number(dowParam);
      const hour = Number(hourParam);
      if (dow >= 0 && dow <= 6 && hour >= 0 && hour <= 23) {
        const detail = buildCellDetail(result, dow, hour);
        return NextResponse.json({ ...payload, detail });
      }
    }

    return NextResponse.json(payload);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
