import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { canDecryptCustomerPII } from '@/lib/customerDecryptAuth';

// GET /api/customers/decrypt-logs?storeId=X&page=1&limit=30
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '30', 10)));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const auth = await canDecryptCustomerPII(user.uid, user.email, storeId);
  if (!auth.allowed) {
    return NextResponse.json({ error: '조회 이력 열람 권한이 없습니다' }, { status: 403 });
  }

  try {
    const base = adminDb.collection('customer_decrypt_logs').where('storeId', '==', storeId);

    const snap = await base
      .orderBy('createdAt', 'desc')
      .offset((page - 1) * limit)
      .limit(limit)
      .get();

    // count 쿼리 (인덱스 없을 때 fallback)
    let total = snap.size;
    try {
      const countSnap = await base.count().get();
      total = countSnap.data().count;
    } catch {
      if (snap.size === limit) total = page * limit + 1;
      else total = (page - 1) * limit + snap.size;
    }

    const logs = snap.docs.map(d => {
      const r = d.data();
      const createdAt = r.createdAt?.toDate?.()
        ? r.createdAt.toDate().toISOString()
        : String(r.createdAt || '');
      return {
        id: d.id,
        storeId: r.storeId,
        action: r.action || 'single',
        requestedByEmail: r.requestedByEmail || '',
        groupId: r.groupId || '',
        customerCount: r.customerCount ?? (r.cusCode ? 1 : 0),
        cusCode: r.cusCode || '',
        filters: r.filters || null,
        createdAt,
      };
    });

    return NextResponse.json({ logs, total, page, limit });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
