import { NextResponse } from 'next/server';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';
import { listRecentOrders } from '@/lib/stock/execution.server';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);
  const orders = await listRecentOrders(auth.user.uid, 100);
  return NextResponse.json({ ok: true, orders });
}
