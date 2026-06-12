import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { syncHometaxEvidence } from '@/lib/purchase/hometaxSync.server';

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '').trim();
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const result = await syncHometaxEvidence({
      storeId,
      uid: authUser.uid,
      startDate: body.startDate ? String(body.startDate) : undefined,
      endDate: body.endDate ? String(body.endDate) : undefined,
      lookbackDays: body.lookbackDays != null ? Number(body.lookbackDays) : undefined,
      trigger: 'manual',
    });

    return NextResponse.json({ success: result.ok, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '동기화 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
