import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    const searchQuery = searchParams.get('search');
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status') || 'active';

    // 특정 매장의 멤버 목록 (storeId 기준)
    if (storeId) {
      const mapSnap = await adminDb.collection('user_store_map')
        .where('storeId', '==', storeId)
        .where('status', '==', status)
        .get();

      const members = await Promise.all(
        mapSnap.docs.map(async (doc) => {
          const { uid: memberUid, role, status: memberStatus, appliedAt, linkedAt } = doc.data();
          const userDoc = await adminDb.collection('users').doc(memberUid).get();
          return {
            mapId: doc.id,
            uid: memberUid,
            role,
            status: memberStatus,
            appliedAt,
            linkedAt,
            ...(userDoc.exists ? userDoc.data() : {}),
          };
        })
      );
      return NextResponse.json({ members });
    }

    // 전체 매장 검색 (uid 없이 search 파라미터)
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
      .where('status', '==', status)
      .get();

    if (mapSnap.empty) return NextResponse.json({ stores: [] });

    const stores = await Promise.all(
      mapSnap.docs.map(async (mapDoc) => {
        const { storeId, role } = mapDoc.data();
        const storeDoc = await adminDb.collection('stores').doc(storeId).get();
        if (!storeDoc.exists) return null;
        return { storeId, role, status, ...storeDoc.data() };
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

    // [신규 매장 생성]
    if (action === 'create') {
      const { storeName, ownerName, regionSido, regionSigungu, address, phone, businessNumber } = body;
      if (!uid || !storeName || !regionSido || !regionSigungu) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeId = `STR-${Date.now()}`;
      await adminDb.collection('stores').doc(storeId).set({
        storeId, storeName,
        ownerName: ownerName || '',
        region: `${regionSido} ${regionSigungu}`,
        regionSido, regionSigungu,
        address: address || '',
        phone: phone || '',
        businessNumber: businessNumber || '',
        createdAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection('user_store_map').add({
        uid, storeId, role: 'owner', status: 'active',
        linkedAt: FieldValue.serverTimestamp(), unlinkedAt: null,
      });

      return NextResponse.json({ success: true, storeId });
    }

    // [매장 소속 신청 - pending 상태로 생성]
    if (action === 'apply') {
      const { storeId } = body;
      if (!uid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeDoc = await adminDb.collection('stores').doc(storeId).get();
      if (!storeDoc.exists) {
        return NextResponse.json({ error: '존재하지 않는 매장입니다.' }, { status: 404 });
      }

      // 이미 신청/연결 여부 확인
      const existSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', uid)
        .where('storeId', '==', storeId)
        .get();

      if (!existSnap.empty) {
        const existing = existSnap.docs[0].data();
        return NextResponse.json({
          error: existing.status === 'pending'
            ? '이미 승인 대기 중입니다.'
            : '이미 해당 매장에 소속되어 있습니다.'
        }, { status: 409 });
      }

      await adminDb.collection('user_store_map').add({
        uid, storeId, role: 'staff', status: 'pending',
        appliedAt: FieldValue.serverTimestamp(), linkedAt: null, unlinkedAt: null,
      });

      return NextResponse.json({ success: true, store: { storeId, ...storeDoc.data() } });
    }

    // [기존 매장 연결 - active로 직접 연결 (superuser용)]
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
          status: 'active', linkedAt: FieldValue.serverTimestamp(), unlinkedAt: null,
        });
      } else {
        await adminDb.collection('user_store_map').add({
          uid, storeId, role: 'staff', status: 'active',
          linkedAt: FieldValue.serverTimestamp(), unlinkedAt: null,
        });
      }

      return NextResponse.json({ success: true, store: { storeId, ...storeDoc.data() } });
    }

    // [멤버 승인]
    if (action === 'approve') {
      const { targetUid, storeId } = body;
      if (!targetUid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const snap = await adminDb.collection('user_store_map')
        .where('uid', '==', targetUid)
        .where('storeId', '==', storeId)
        .where('status', '==', 'pending')
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: '대기 중인 신청이 없습니다.' }, { status: 404 });
      }

      await snap.docs[0].ref.update({
        status: 'active', linkedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    // [멤버 거절]
    if (action === 'reject') {
      const { targetUid, storeId } = body;
      if (!targetUid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const snap = await adminDb.collection('user_store_map')
        .where('uid', '==', targetUid)
        .where('storeId', '==', storeId)
        .where('status', '==', 'pending')
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.delete();
      }

      return NextResponse.json({ success: true });
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
      storeName, ownerName: ownerName || '', region, regionSido, regionSigungu,
      address: address || '', phone: phone || '', businessNumber: businessNumber || '',
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
