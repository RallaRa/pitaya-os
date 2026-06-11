import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';
import { calcItemPrices } from '@/lib/items/calcItemPrices';
import { sendCostRatioAlertForItem } from '@/lib/costRatioAlert.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId  = searchParams.get('storeId') || '';
  const category = searchParams.get('category') || '';

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('items').where('storeId', '==', storeId);
    if (category && category !== '전체') q = q.where('category', '==', category);
    const snap = await q.orderBy('category').orderBy('cut').get();
    return NextResponse.json({ items: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupId = await getActualGroupId(authUser.uid);
  if (!isAdminOrAbove(groupId, authUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { storeId, item } = await req.json();
  if (!storeId || !item) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

  const prices = calcItemPrices(
    item.buyPrice || 0, item.targetMargin || 0, item.appliedCost || 0, item.lossRate || 0,
  );
  const now = FieldValue.serverTimestamp();
  const ref = adminDb.collection('items').doc();
  await ref.set({ ...item, ...prices, storeId, priceHistory: [], createdAt: now, updatedAt: now });
  return NextResponse.json({ id: ref.id });
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupId = await getActualGroupId(authUser.uid);
  if (!isAdminOrAbove(groupId, authUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { id, updates } = await req.json();
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  const existing = await adminDb.collection('items').doc(id).get();
  if (!existing.exists) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const current = existing.data() || {};
  const priceFields = ['buyPrice', 'targetMargin', 'appliedCost', 'lossRate'] as const;
  const hasPriceUpdate = priceFields.some(k => updates[k] !== undefined);
  const prices = hasPriceUpdate
    ? calcItemPrices(
      Number(updates.buyPrice ?? current.buyPrice ?? 0),
      Number(updates.targetMargin ?? current.targetMargin ?? 0),
      Number(updates.appliedCost ?? current.appliedCost ?? 0),
      Number(updates.lossRate ?? current.lossRate ?? 0),
    )
    : {};
  const historyPatch: Record<string, any> = {};
  const oldBuyPrice = current.buyPrice;
  if (updates.buyPrice !== undefined) {
    if (oldBuyPrice !== updates.buyPrice) {
      historyPatch.priceHistory = FieldValue.arrayUnion({
        date: new Date().toISOString(),
        oldPrice: oldBuyPrice,
        newPrice: updates.buyPrice,
        changedBy: authUser.uid,
      });
    }
  }

  await adminDb.collection('items').doc(id).update({
    ...updates,
    ...prices,
    ...historyPatch,
    updatedAt: FieldValue.serverTimestamp(),
  });

  const storeId = String(current.storeId || updates.storeId || '');
  if (storeId && updates.buyPrice !== undefined && oldBuyPrice !== updates.buyPrice) {
    sendCostRatioAlertForItem(storeId, id).catch(err => {
      console.warn('[items] cost ratio alert failed:', err);
    });
  }

  return NextResponse.json({ success: true, ...prices });
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const groupId = await getActualGroupId(authUser.uid);
  if (!isAdminOrAbove(groupId, authUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'id 필수' }, { status: 400 });

  await adminDb.collection('items').doc(id).delete();
  return NextResponse.json({ success: true });
}
