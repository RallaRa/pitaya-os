import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  DEFAULT_FIXED_COSTS,
  loadFixedCostsSettings,
  saveFixedCosts,
  saveBreakEvenMeta,
} from '@/lib/fixedCostsSettings';
import type { FixedCosts } from '@/lib/fixedCosts';
import { computeBusinessDaysForCurrentMonth } from '@/lib/businessDays';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const settings = await loadFixedCostsSettings(storeId);
  return NextResponse.json({
    storeId,
    costs: settings.costs,
    closedDays: settings.closedDays,
    breakEvenMeta: settings.breakEvenMeta,
    defaults: DEFAULT_FIXED_COSTS,
  });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as {
      storeId?: string;
      costs?: Partial<FixedCosts>;
      closedDays?: string[];
    };
    const { storeId, costs, closedDays } = body;
    if (!storeId) {
      return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });
    }

    if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const merged = await saveFixedCosts(storeId, costs || {}, closedDays);
    if (closedDays != null) {
      const computed = computeBusinessDaysForCurrentMonth(closedDays.filter(Boolean));
      await saveBreakEvenMeta(storeId, {
        monthKey: computed.monthKey,
        businessDays: computed.businessDays,
        closedDays: closedDays.filter(Boolean),
      });
    }
    const settings = await loadFixedCostsSettings(storeId);
    return NextResponse.json({
      success: true,
      costs: merged,
      closedDays: settings.closedDays,
      breakEvenMeta: settings.breakEvenMeta,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
