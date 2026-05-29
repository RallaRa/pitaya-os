import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const snap = await adminDb.collection('coupons')
    .where('storeId', '==', storeId)
    .orderBy('createdAt', 'desc')
    .get();

  const coupons = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ coupons });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { storeId, code, type, value, minAmount = 0, maxDiscount = 0, maxUse = 0, startDate, endDate } = body;

  if (!storeId || !code || !type || !value) {
    return NextResponse.json({ error: '필수 필드 누락' }, { status: 400 });
  }

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const upperCode = String(code).trim().toUpperCase();

  // Duplicate check
  const dup = await adminDb.collection('coupons')
    .where('storeId', '==', storeId)
    .where('code', '==', upperCode)
    .limit(1).get();
  if (!dup.empty) return NextResponse.json({ error: '이미 존재하는 쿠폰 코드입니다' }, { status: 409 });

  const ref = await adminDb.collection('coupons').add({
    storeId, code: upperCode, type, value: Number(value),
    minAmount: Number(minAmount), maxDiscount: Number(maxDiscount),
    maxUse: Number(maxUse), startDate: startDate || null, endDate: endDate || null,
    isActive: true, usedCount: 0,
    createdBy: authUser.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ id: ref.id, code: upperCode });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const { id, storeId, ...updates } = body;
  if (!id || !storeId) return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const allowed = ['type','value','minAmount','maxDiscount','maxUse','startDate','endDate','isActive'];
  const patch: Record<string, unknown> = {};
  for (const k of allowed) {
    if (k in updates) patch[k] = updates[k];
  }
  patch.updatedAt = FieldValue.serverTimestamp();

  await adminDb.collection('coupons').doc(id).update(patch);
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id      = searchParams.get('id')      || '';
  const storeId = searchParams.get('storeId') || '';
  if (!id || !storeId) return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await adminDb.collection('coupons').doc(id).delete();
  return NextResponse.json({ ok: true });
}
