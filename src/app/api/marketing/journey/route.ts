import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { cancelNotificationQueueItem, listNotificationQueue } from '@/lib/customerJourney.server';

/** GET /api/marketing/journey?storeId=&status=&page=&limit= */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const status = searchParams.get('status') || '';
  const page = Number(searchParams.get('page') || 1);
  const limit = Number(searchParams.get('limit') || 30);

  try {
    const result = await listNotificationQueue(storeId, { status: status || undefined, page, limit });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** DELETE /api/marketing/journey?id=&storeId= */
export async function DELETE(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const id = searchParams.get('id') || '';
  if (!storeId || !id) {
    return NextResponse.json({ error: 'storeId and id required' }, { status: 400 });
  }

  try {
    const ok = await cancelNotificationQueueItem(storeId, id);
    if (!ok) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ ok: true, id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
