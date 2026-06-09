import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId 필요' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const snap = await adminDb.collection('coupon_layouts')
    .where('storeId', '==', storeId)
    .orderBy('createdAt', 'desc')
    .get();

  const layouts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ layouts });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const storeId = String(body.storeId || '').trim();
  const name = String(body.name || '').trim();
  const backgroundUrl = String(body.backgroundUrl || '').trim();
  if (!storeId || !name || !backgroundUrl) {
    return NextResponse.json({ error: 'storeId, name, backgroundUrl 필요' }, { status: 400 });
  }

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const ref = await adminDb.collection('coupon_layouts').add({
    storeId,
    name,
    backgroundUrl,
    imagePrompt: body.imagePrompt ? String(body.imagePrompt).trim() : '',
    includeBarcodeDefault: body.includeBarcodeDefault !== false,
    isDefault: !!body.isDefault,
    createdBy: authUser.uid,
    createdAt: FieldValue.serverTimestamp(),
  });

  if (body.isDefault) {
    const others = await adminDb.collection('coupon_layouts')
      .where('storeId', '==', storeId)
      .get();
    const batch = adminDb.batch();
    others.docs.forEach(doc => {
      if (doc.id !== ref.id) batch.update(doc.ref, { isDefault: false });
    });
    await batch.commit();
  }

  return NextResponse.json({ id: ref.id, name, backgroundUrl });
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  const storeId = searchParams.get('storeId') || '';
  if (!id || !storeId) return NextResponse.json({ error: 'id, storeId 필요' }, { status: 400 });

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const doc = await adminDb.collection('coupon_layouts').doc(id).get();
  if (!doc.exists || doc.data()?.storeId !== storeId) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  await doc.ref.delete();
  return NextResponse.json({ ok: true });
}
