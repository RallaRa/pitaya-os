import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const couponId = searchParams.get('couponId') || '';
  const page = Math.max(1, Number(searchParams.get('page') || 1));
  const limit = Math.min(100, Math.max(1, Number(searchParams.get('limit') || 30)));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  let q = adminDb.collection('coupon_redemption_logs').where('storeId', '==', storeId);
  if (couponId) q = q.where('couponId', '==', couponId);

  const snap = await q.orderBy('appliedAt', 'desc').offset((page - 1) * limit).limit(limit).get();

  const logs = snap.docs.map(doc => {
    const d = doc.data();
    return {
      id: doc.id,
      couponId: d.couponId || '',
      code: d.code || '',
      title: d.title || '',
      orderAmount: d.orderAmount || 0,
      discountAmount: d.discountAmount || 0,
      netAfterDiscount: d.netAfterDiscount || 0,
      appliedByEmail: d.appliedByEmail || '',
      note: d.note || '',
      customerCusCode: d.customerCusCode || '',
      ymd: d.ymd || '',
      appliedAt: d.appliedAt?.toDate?.() ? d.appliedAt.toDate().toISOString() : '',
    };
  });

  return NextResponse.json({ logs, page, limit });
}
