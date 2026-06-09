import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';
import { adminDb } from '@/lib/firebase/admin';
import { serializeIdentity } from '@/lib/publicOrderIdentity';

export const dynamic = 'force-dynamic';

/** GET — 미매치 공개주문 신원 목록 */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  const snap = await adminDb.collection('public_order_identities')
    .where('storeId', '==', storeId)
    .limit(300)
    .get();

  const items = snap.docs
    .map(d => serializeIdentity(d.id, d.data() as Record<string, unknown>))
    .filter(i => !i.resolved && i.matchStatus !== 'matched')
    .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

  return NextResponse.json({ items, total: items.length });
}
