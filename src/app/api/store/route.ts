import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase/firebase';
import {
  collection, doc, getDoc, getDocs,
  setDoc, addDoc, query, where,
  serverTimestamp, updateDoc
} from 'firebase/firestore';

// 내 매장 목록 조회
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    if (!uid) return NextResponse.json({ error: 'uid 없음' }, { status: 400 });

    const mapQuery = query(
      collection(db, 'user_store_map'),
      where('uid', '==', uid),
      where('status', '==', 'active')
    );
    const mapSnap = await getDocs(mapQuery);

    if (mapSnap.empty) return NextResponse.json({ stores: [] });

    const stores = await Promise.all(
      mapSnap.docs.map(async (mapDoc) => {
        const { storeId, role } = mapDoc.data();
        const storeDoc = await getDoc(doc(db, 'stores', storeId));
        if (!storeDoc.exists()) return null;
        return { storeId, role, ...storeDoc.data() };
      })
    );

    return NextResponse.json({
      stores: stores.filter(Boolean)
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 매장 생성 또는 연결
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { action, uid } = body;

    // [신규 매장 생성]
    if (action === 'create') {
      const { storeName, ownerName, regionSido,
              regionSigungu, address, phone, businessNumber } = body;

      if (!uid || !storeName || !regionSido || !regionSigungu) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeId = `STR-${Date.now()}`;

      await setDoc(doc(db, 'stores', storeId), {
        storeId,
        storeName,
        ownerName: ownerName || '',
        region: `${regionSido} ${regionSigungu}`,
        regionSido,
        regionSigungu,
        address: address || '',
        phone: phone || '',
        businessNumber: businessNumber || '',
        createdAt: serverTimestamp(),
      });

      await addDoc(collection(db, 'user_store_map'), {
        uid,
        storeId,
        role: 'owner',
        status: 'active',
        linkedAt: serverTimestamp(),
        unlinkedAt: null,
      });

      return NextResponse.json({ success: true, storeId });
    }

    // [기존 매장 연결]
    if (action === 'link') {
      const { storeId } = body;
      if (!uid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeDoc = await getDoc(doc(db, 'stores', storeId));
      if (!storeDoc.exists()) {
        return NextResponse.json({ error: '존재하지 않는 매장입니다.' }, { status: 404 });
      }

      const existQuery = query(
        collection(db, 'user_store_map'),
        where('uid', '==', uid),
        where('storeId', '==', storeId)
      );
      const existSnap = await getDocs(existQuery);

      if (!existSnap.empty) {
        await updateDoc(existSnap.docs[0].ref, {
          status: 'active',
          linkedAt: serverTimestamp(),
          unlinkedAt: null,
        });
      } else {
        await addDoc(collection(db, 'user_store_map'), {
          uid,
          storeId,
          role: 'staff',
          status: 'active',
          linkedAt: serverTimestamp(),
          unlinkedAt: null,
        });
      }

      return NextResponse.json({
        success: true,
        store: { storeId, ...storeDoc.data() }
      });
    }

    return NextResponse.json({ error: '잘못된 action' }, { status: 400 });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// 매장 정보 수정
export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { storeId, storeName, ownerName, regionSido,
            regionSigungu, region, address, phone, businessNumber } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });
    }

    await updateDoc(doc(db, 'stores', storeId), {
      storeName,
      ownerName: ownerName || '',
      region,
      regionSido,
      regionSigungu,
      address: address || '',
      phone: phone || '',
      businessNumber: businessNumber || '',
      updatedAt: serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
