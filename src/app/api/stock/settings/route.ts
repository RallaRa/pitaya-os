import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getStockSettings, saveStockSettings } from '@/lib/stock/settings.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const settings = await getStockSettings(auth.user.uid);
  return NextResponse.json({ ok: true, settings });
}

export async function PUT(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 403);
  const body = await req.json().catch(() => ({}));
  await saveStockSettings(auth.user.uid, body);
  return NextResponse.json({ ok: true });
}
