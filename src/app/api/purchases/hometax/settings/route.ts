import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { updateHometaxSyncSettings } from '@/lib/purchase/hometaxSession.server';

export async function PATCH(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const status = await updateHometaxSyncSettings(storeId, {
      autoSyncEnabled: typeof body.autoSyncEnabled === 'boolean' ? body.autoSyncEnabled : undefined,
      syncLookbackDays: body.syncLookbackDays != null ? Number(body.syncLookbackDays) : undefined,
    });

    return NextResponse.json({ success: true, ...status });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '설정 저장 실패';
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
