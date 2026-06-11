import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  DEFAULT_POS_ALERT_SETTINGS,
  getPosAlertSettings,
  savePosAlertSettings,
  type PosAlertSettings,
} from '@/lib/pos/posAlertSettings';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId');
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const settings = await getPosAlertSettings(storeId);
  return NextResponse.json({ storeId, settings, defaults: DEFAULT_POS_ALERT_SETTINGS });
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json() as { storeId?: string; settings?: Partial<PosAlertSettings> };
  const { storeId, settings } = body;
  if (!storeId || !settings) {
    return NextResponse.json({ error: 'storeId, settings 필요' }, { status: 400 });
  }

  if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const patch: Partial<PosAlertSettings> = {};
  if (typeof settings.realtimeSaleEnabled === 'boolean') patch.realtimeSaleEnabled = settings.realtimeSaleEnabled;
  if (typeof settings.dailyCloseEnabled === 'boolean') patch.dailyCloseEnabled = settings.dailyCloseEnabled;
  if (typeof settings.goodsSyncNotifyEnabled === 'boolean') patch.goodsSyncNotifyEnabled = settings.goodsSyncNotifyEnabled;
  if (typeof settings.itemSpeedAlertEnabled === 'boolean') patch.itemSpeedAlertEnabled = settings.itemSpeedAlertEnabled;
  if (typeof settings.firstPurchaseEnabled === 'boolean') patch.firstPurchaseEnabled = settings.firstPurchaseEnabled;
  if (typeof settings.vipVisitEnabled === 'boolean') patch.vipVisitEnabled = settings.vipVisitEnabled;
  if (typeof settings.regularVisitEnabled === 'boolean') patch.regularVisitEnabled = settings.regularVisitEnabled;
  if (typeof settings.discountAbuseEnabled === 'boolean') patch.discountAbuseEnabled = settings.discountAbuseEnabled;
  if (typeof settings.transactionAnomalyEnabled === 'boolean') patch.transactionAnomalyEnabled = settings.transactionAnomalyEnabled;
  if (typeof settings.repurchaseReminderEnabled === 'boolean') patch.repurchaseReminderEnabled = settings.repurchaseReminderEnabled;
  if (typeof settings.signageAutoSwitchEnabled === 'boolean') patch.signageAutoSwitchEnabled = settings.signageAutoSwitchEnabled;

  const merged = await savePosAlertSettings(storeId, patch);
  return NextResponse.json({ success: true, settings: merged });
}
