import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  completeBriefingActionLog,
  createBriefingActionLog,
} from '@/lib/briefing/briefingActionLog.server';
import type { BriefingActionType } from '@/lib/briefingActions';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const actionType = String(body.actionType || '') as BriefingActionType;
    const text = String(body.text || '').trim();

    if (!storeId || !text || !['coupon', 'signage', 'order'].includes(actionType)) {
      return NextResponse.json({ error: 'storeId, actionType, text 필요' }, { status: 400 });
    }

    const { id } = await createBriefingActionLog({
      storeId,
      actionType,
      text,
      basis: body.basis ? String(body.basis) : undefined,
      params: body.params || undefined,
      briefingDateYmd: body.briefingDateYmd ? String(body.briefingDateYmd) : undefined,
      uid: authUser.uid,
    });

    return NextResponse.json({ success: true, logId: id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const logId = String(body.logId || '');
    const storeId = String(body.storeId || '');

    if (!logId || !storeId) {
      return NextResponse.json({ error: 'logId, storeId 필요' }, { status: 400 });
    }

    const attribution = await completeBriefingActionLog({
      logId,
      storeId,
      result: body.result || undefined,
    });

    if (!attribution) {
      return NextResponse.json({ error: '로그를 찾을 수 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ success: true, attribution });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
