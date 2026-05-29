import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';

export function calcItemPrices(
  buyPrice: number,
  targetMargin: number,
  appliedCost: number,
  lossRate: number,
) {
  if (!buyPrice || buyPrice <= 0) {
    return { kgTargetPrice: 0, kgSalePrice: 0, geunTargetPrice: 0, geunSalePrice: 0 };
  }
  const kgTargetPrice = Math.round((buyPrice / (1 - targetMargin)) * (1 + lossRate));
  const kgSalePrice   = Math.round((buyPrice / (1 - appliedCost))  * (1 + lossRate));
  return {
    kgTargetPrice,
    kgSalePrice,
    geunTargetPrice: Math.round(kgTargetPrice * 0.6),
    geunSalePrice:   Math.round(kgSalePrice   * 0.6),
  };
}

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

  const prices = calcItemPrices(
    updates.buyPrice, updates.targetMargin, updates.appliedCost, updates.lossRate,
  );

  const existing = await adminDb.collection('items').doc(id).get();
  const historyPatch: Record<string, any> = {};
  if (existing.exists && updates.buyPrice !== undefined) {
    const oldPrice = existing.data()?.buyPrice;
    if (oldPrice !== updates.buyPrice) {
      historyPatch.priceHistory = FieldValue.arrayUnion({
        date: new Date().toISOString(),
        oldPrice,
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
