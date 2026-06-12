import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { computeProfitSimulation } from '@/lib/profitSimulation.server';
import type { SimulationInputs } from '@/lib/profitSimulationCalc';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const growth = searchParams.get('revenueGrowthPct');
  const costDelta = searchParams.get('costRatioDeltaPct');
  const fixedDelta = searchParams.get('fixedCostDeltaPct');

  let custom: SimulationInputs | undefined;
  if (growth != null || costDelta != null || fixedDelta != null) {
    custom = {
      revenueGrowthPct: Number(growth ?? 0),
      costRatioDeltaPct: Number(costDelta ?? 0),
      fixedCostDeltaPct: Number(fixedDelta ?? 0),
    };
  }

  try {
    const result = await computeProfitSimulation(storeId, custom);
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
