import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { computeDowProfitDetail, computeDowProfitability } from '@/lib/dowProfitability';
import type { DowPeriod } from '@/lib/dowProfitabilityCalc';

const VALID_PERIODS = new Set<DowPeriod>(['week', 'month', 'quarter']);

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const periodRaw = (searchParams.get('period') || 'month') as DowPeriod;
  const period = VALID_PERIODS.has(periodRaw) ? periodRaw : 'month';
  const dowParam = searchParams.get('dow');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    if (dowParam != null) {
      const dow = Number(dowParam);
      if (dow >= 0 && dow <= 6) {
        const detail = await computeDowProfitDetail(storeId, period, dow);
        if (!detail) return NextResponse.json({ error: 'no data' }, { status: 404 });
        return NextResponse.json({ period, detail });
      }
    }

    const result = await computeDowProfitability(storeId, period);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
