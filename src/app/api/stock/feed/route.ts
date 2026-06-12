import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const [ordersSnap, decisionsSnap] = await Promise.all([
    adminDb.collection('stock_orders').orderBy('executedAt', 'desc').limit(30).get(),
    adminDb.collection('stock_ai_decisions').orderBy('timestamp', 'desc').limit(15).get(),
  ]);

  const orders = ordersSnap.docs.map(d => ({ id: d.id, ...d.data() })).slice(0, 20);

  const decisions = decisionsSnap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ ok: true, orders, decisions });
}
