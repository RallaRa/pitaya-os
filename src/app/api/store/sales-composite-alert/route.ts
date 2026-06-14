import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  COMPOSITE_PRESETS,
  type CompositePresetId,
} from '@/lib/salesCompositeAlert.config';
import {
  DEFAULT_SALES_COMPOSITE_ALERT_SETTINGS,
  getSalesCompositeAlertSettings,
  saveSalesCompositeAlertSettings,
  type SalesCompositeAlertSettings,
  type SalesCompositeAlertSettingsPatch,
} from '@/lib/salesCompositeAlertSettings';

const PRESET_IDS = Object.keys(COMPOSITE_PRESETS) as CompositePresetId[];

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const settings = await getSalesCompositeAlertSettings(storeId);
  return NextResponse.json({
    storeId,
    settings,
    defaults: DEFAULT_SALES_COMPOSITE_ALERT_SETTINGS,
    presets: COMPOSITE_PRESETS,
    presetIds: PRESET_IDS,
  });
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as {
    storeId?: string;
    settings?: SalesCompositeAlertSettingsPatch;
  };
  const { storeId, settings } = body;
  if (!storeId || !settings) {
    return NextResponse.json({ error: 'storeId, settings 필요' }, { status: 400 });
  }

  if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const patch: SalesCompositeAlertSettingsPatch = {};
  if (typeof settings.enabled === 'boolean') patch.enabled = settings.enabled;
  if (typeof settings.intradayEnabled === 'boolean') patch.intradayEnabled = settings.intradayEnabled;
  if (typeof settings.eodEnabled === 'boolean') patch.eodEnabled = settings.eodEnabled;
  if (typeof settings.aiEnrichmentEnabled === 'boolean') patch.aiEnrichmentEnabled = settings.aiEnrichmentEnabled;
  if (typeof settings.zScoreEnabled === 'boolean') patch.zScoreEnabled = settings.zScoreEnabled;
  if (settings.preset && PRESET_IDS.includes(settings.preset)) patch.preset = settings.preset;
  if (settings.metrics) {
    const metrics: Partial<SalesCompositeAlertSettings['metrics']> = {};
    if (typeof settings.metrics.netSales === 'boolean') metrics.netSales = settings.metrics.netSales;
    if (typeof settings.metrics.customerCount === 'boolean') metrics.customerCount = settings.metrics.customerCount;
    if (typeof settings.metrics.avgTicket === 'boolean') metrics.avgTicket = settings.metrics.avgTicket;
    if (Object.keys(metrics).length > 0) patch.metrics = metrics;
  }

  const merged = await saveSalesCompositeAlertSettings(storeId, patch);
  return NextResponse.json({ success: true, settings: merged });
}
