import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { getStockSettings, saveStockSettings } from '@/lib/stock/settings.server';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const body = await req.json().catch(() => ({}));
  const enabled = body.enabled === true;
  await saveStockSettings(auth.user.uid, { masterEnabled: enabled });

  return NextResponse.json({ ok: true, masterEnabled: enabled });
}

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const settings = await getStockSettings(auth.user.uid);
  return NextResponse.json({ ok: true, masterEnabled: settings.masterEnabled });
}
