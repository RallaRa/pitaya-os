import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

/** GET /api/scale/pending?storeId= — POS 동기화 시 뒤3자리 중복(확인 대기) */
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const snap = await adminDb.collection('scale_code_pending').doc(storeId).get();
  if (!snap.exists) {
    return NextResponse.json({ status: 'none', groups: [], groupCount: 0, itemCount: 0 });
  }

  const d = snap.data()!;
  return NextResponse.json({
    status: d.status || 'pending',
    groups: d.groups || [],
    groupCount: d.groupCount ?? (d.groups?.length || 0),
    itemCount: d.itemCount ?? 0,
    syncedAt: d.syncedAt,
  });
}
