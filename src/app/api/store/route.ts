import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    const searchQuery = searchParams.get('search');

    if (searchQuery !== null && !uid) {
      const storesSnap = await adminDb.collection('stores').get();
      const keyword = searchQuery.toLowerCase().trim();
      const allDocs = storesSnap.docs.map(d => ({ storeId: d.id, ...d.data() }));
      const results = keyword === ''
        ? allDocs
        : allDocs.filter((store: any) =>
            store.storeId?.toLowerCase().includes(keyword) ||
            store.storeName?.toLowerCase().includes(keyword) ||
            store.ownerName?.toLowerCase().includes(keyword)
          ).slice(0, 10);
      return NextResponse.json({ stores: results });
    }

    if (!uid) return NextResponse.json({ error: 'uid 없음' }, { status: 400 });

    const mapSnap = await adminDb.collection('user_store_map')
      .where('uid', '==', uid)
      .where('status', '==', 'active')
      .get();

    if (mapSnap.empty) return NextResponse.json({ stores: [] });

    const stores = await Promise.all(
      mapSnap.docs.map(async (mapDoc) => {
        const { storeId, role } = mapDoc.data();
        const storeDoc = await adminDb.collection('stores').doc(storeId).get();
        if (!storeDoc.exists) return null;
        return { storeId, role, ...storeDoc.data() };
      })
    );

    return NextResponse.json({ stores: stores.filter(Boolean) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, uid } = body;

    if (action === 'create') {
      const { storeName, ownerName, regionSido, regionSigungu, address, phone, businessNumber } = body;
      if (!uid || !storeName || !regionSido || !regionSigungu) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeId = `STR-${Date.now()}`;
      await adminDb.collection('stores').doc(storeId).set({
        storeId,
        storeName,
        ownerName: ownerName || '',
        region: `${regionSido} ${regionSigungu}`,
        regionSido,
        regionSigungu,
        address: address || '',
        phone: phone || '',
        businessNumber: businessNumber || '',
        createdAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection('user_store_map').add({
        uid,
        storeId,
        role: 'owner',
        status: 'active',
        linkedAt: FieldValue.serverTimestamp(),
        unlinkedAt: null,
      });

      return NextResponse.json({ success: true, storeId });
    }

    if (action === 'link') {
      const { storeId } = body;
      if (!uid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeDoc = await adminDb.collection('stores').doc(storeId).get();
      if (!storeDoc.exists) {
        return NextResponse.json({ error: '존재하지 않는 매장입니다.' }, { status: 404 });
      }

      const existSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', uid)
        .where('storeId', '==', storeId)
        .get();

      if (!existSnap.empty) {
        await existSnap.docs[0].ref.update({
          status: 'active',
          linkedAt: FieldValue.serverTimestamp(),
          unlinkedAt: null,
        });
      } else {
        await adminDb.collection('user_store_map').add({
          uid,
          storeId,
          role: 'staff',
          status: 'active',
          linkedAt: FieldValue.serverTimestamp(),
          unlinkedAt: null,
        });
      }

      return NextResponse.json({ success: true, store: { storeId, ...storeDoc.data() } });
    }

    return NextResponse.json({ error: '잘못된 action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { storeId, storeName, ownerName, regionSido, regionSigungu, region, address, phone, businessNumber } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });
    }

    await adminDb.collection('stores').doc(storeId).update({
      storeName,
      ownerName: ownerName || '',
      region,
      regionSido,
      regionSigungu,
      address: address || '',
      phone: phone || '',
      businessNumber: businessNumber || '',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
