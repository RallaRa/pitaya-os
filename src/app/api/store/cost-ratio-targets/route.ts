import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  DEFAULT_COST_RATIO_SETTINGS,
  getCostRatioSettings,
  saveCostRatioSettings,
  type CostRatioSettings,
} from '@/lib/costRatioSettings';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const settings = await getCostRatioSettings(storeId);
  return NextResponse.json({ storeId, settings, defaults: DEFAULT_COST_RATIO_SETTINGS });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as { storeId?: string; settings?: Partial<CostRatioSettings> };
    const { storeId, settings } = body;
    if (!storeId || !settings) {
      return NextResponse.json({ error: 'storeId, settings 필요' }, { status: 400 });
    }

    if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const patch: Partial<CostRatioSettings> = {};
    if (settings.globalTargetRatio != null) {
      patch.globalTargetRatio = Math.min(0.95, Math.max(0.1, Number(settings.globalTargetRatio)));
    }
    if (settings.itemTargets && typeof settings.itemTargets === 'object') {
      const cleaned: Record<string, number> = {};
      for (const [k, v] of Object.entries(settings.itemTargets)) {
        const n = Number(v);
        if (n > 0) cleaned[k] = Math.min(0.95, Math.max(0.1, n));
      }
      patch.itemTargets = cleaned;
    }

    const merged = await saveCostRatioSettings(storeId, patch);
    return NextResponse.json({ success: true, settings: merged });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
