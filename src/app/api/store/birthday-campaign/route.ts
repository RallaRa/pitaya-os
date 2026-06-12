import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  DEFAULT_BIRTHDAY_SETTINGS,
  getBirthdayCampaignSettings,
  saveBirthdayCampaignSettings,
  type BirthdayCampaignSettings,
} from '@/lib/birthdaySettings';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const settings = await getBirthdayCampaignSettings(storeId);
  return NextResponse.json({ storeId, settings, defaults: DEFAULT_BIRTHDAY_SETTINGS });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json() as { storeId?: string; settings?: Partial<BirthdayCampaignSettings> };
    const { storeId, settings } = body;
    if (!storeId || !settings) {
      return NextResponse.json({ error: 'storeId, settings 필요' }, { status: 400 });
    }

    if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const patch: Partial<BirthdayCampaignSettings> = {};
    if (settings.enabled != null) patch.enabled = !!settings.enabled;
    if (settings.couponType != null) {
      patch.couponType = settings.couponType === 'percent' ? 'percent' : 'fixed';
    }
    if (settings.couponValue != null) {
      patch.couponValue = Math.max(0, Number(settings.couponValue));
    }
    if (settings.couponMinAmount != null) {
      patch.couponMinAmount = Math.max(0, Number(settings.couponMinAmount));
    }
    if (settings.couponValidDays != null) {
      patch.couponValidDays = Math.min(90, Math.max(1, Number(settings.couponValidDays)));
    }
    if (settings.d3QueueEnabled != null) patch.d3QueueEnabled = !!settings.d3QueueEnabled;
    if (settings.d0MessengerEnabled != null) {
      patch.d0MessengerEnabled = !!settings.d0MessengerEnabled;
    }

    const merged = await saveBirthdayCampaignSettings(storeId, patch);
    return NextResponse.json({ success: true, settings: merged });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'save failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
