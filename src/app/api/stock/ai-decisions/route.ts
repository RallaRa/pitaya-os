import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { requireStockSuperuser, stockAccessDeniedResponse } from '@/lib/stock/superuserAuth';

export const dynamic = 'force-dynamic';

export async function GET(req: Request) {
  const auth = await requireStockSuperuser(req);
  if (auth.error || !auth.user) return stockAccessDeniedResponse(auth.code as 401 | 403);

  const url = new URL(req.url);
  const limit = Math.min(Number(url.searchParams.get('limit') || 10), 50);

  const snap = await adminDb.collection('stock_ai_decisions')
    .orderBy('timestamp', 'desc')
    .limit(limit)
    .get();

  const decisions = snap.docs.map(d => ({ id: d.id, ...d.data() }));

  return NextResponse.json({ ok: true, decisions });
}
