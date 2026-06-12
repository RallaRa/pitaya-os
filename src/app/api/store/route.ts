import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import {
  normalizeRole,
  normalizeGroupId,
  roleToGroupId,
  groupIdToRole,
} from '@/lib/roleMapping';

async function requireSuperuser(authUser: { uid: string; email?: string }) {
  const ok = await isPlatformSuperuser(authUser.uid, authUser.email);
  if (!ok) return NextResponse.json({ error: '슈퍼유저 권한이 필요합니다.' }, { status: 403 });
  return null;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const uid = searchParams.get('uid');
    const searchQuery = searchParams.get('search');
    const storeId = searchParams.get('storeId');
    const status = searchParams.get('status') || 'active';
    const allStores = searchParams.get('allStores') === 'true';

    const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);

    // 슈퍼유저: 전체 매장 목록 (승인 관리용)
    if (allStores) {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;
      const storesSnap = await adminDb.collection('stores').get();
      const stores = storesSnap.docs
        .map(d => ({ storeId: d.id, status: 'active', ...d.data() }))
        .sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
      return NextResponse.json({ stores });
    }

    // 특정 매장의 멤버 목록
    if (storeId) {
      const mapSnap = await adminDb.collection('user_store_map')
        .where('storeId', '==', storeId)
        .where('status', '==', status)
        .get();

      const members = await Promise.all(
        mapSnap.docs.map(async (doc) => {
          const mapData = doc.data();
          const { uid: memberUid, role, status: memberStatus, appliedAt, linkedAt, groupId: mapGroupId } = mapData;
          const userDoc = await adminDb.collection('users').doc(memberUid).get();
          const normalizedRole = normalizeRole(role);
          const normalizedGroupId = normalizeGroupId(mapGroupId || roleToGroupId(role));
          return {
            ...(userDoc.exists ? userDoc.data() : {}),
            mapId: doc.id,
            uid: memberUid,
            role: normalizedRole,
            groupId: normalizedGroupId,
            status: memberStatus,
            appliedAt,
            linkedAt,
          };
        })
      );
      return NextResponse.json({ members });
    }

    // 전체 매장 검색
    if (searchQuery !== null && !uid) {
      const storesSnap = await adminDb.collection('stores').get();
      const keyword = searchQuery.toLowerCase().trim();
      let allDocs = storesSnap.docs.map(d => ({
        storeId: d.id,
        status: 'active',
        ...d.data(),
      }));
      if (!isSU) {
        allDocs = allDocs.filter((s: any) => !s.status || s.status === 'active');
      }
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
        const mapData = mapDoc.data();
        const { storeId: sid, role, groupId: mapGroupId, rejectedReason, rejectedAt } = mapData;
        const storeDoc = await adminDb.collection('stores').doc(sid).get();
        if (!storeDoc.exists) return null;
        const storeData = storeDoc.data()!;
        if (status === 'active' && storeData.status && storeData.status !== 'active') return null;
        return {
          ...storeData,
          storeId: sid,
          role: normalizeRole(role),
          groupId: normalizeGroupId(mapGroupId || roleToGroupId(role)),
          mapStatus: status,
          rejectedReason,
          rejectedAt,
        };
      })
    );

    return NextResponse.json({ stores: stores.filter(Boolean) });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, uid } = body;
    const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);

    // 신규 매장 생성
    if (action === 'create') {
      const { storeName, ownerName, regionSido, regionSigungu, address, phone, businessNumber } = body;
      if (!uid || !storeName || !regionSido || !regionSigungu) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeId = `STR-${Date.now()}`;
      const storeStatus = isSU ? 'active' : 'pending';

      await adminDb.collection('stores').doc(storeId).set({
        storeId,
        storeName,
        ownerName: ownerName || '',
        region: `${regionSido} ${regionSigungu}`,
        regionSido,
        regionSigungu,
        tradeAreaCode: (body.tradeAreaCode || '').trim(),
        address: address || '',
        phone: phone || '',
        businessNumber: businessNumber || '',
        status: storeStatus,
        createdAt: FieldValue.serverTimestamp(),
      });

      await adminDb.collection('user_store_map').add({
        uid,
        storeId,
        role: 'superuser',
        groupId: 'superuser',
        status: isSU ? 'active' : 'pending',
        linkedAt: isSU ? FieldValue.serverTimestamp() : null,
        appliedAt: isSU ? null : FieldValue.serverTimestamp(),
        unlinkedAt: null,
      });

      return NextResponse.json({ success: true, storeId, storeStatus });
    }

    // 매장 소속 신청
    if (action === 'apply') {
      const { storeId } = body;
      if (!uid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const storeDoc = await adminDb.collection('stores').doc(storeId).get();
      if (!storeDoc.exists) {
        return NextResponse.json({ error: '존재하지 않는 매장입니다.' }, { status: 404 });
      }
      const storeData = storeDoc.data()!;
      if (storeData.status === 'pending') {
        return NextResponse.json({ error: '아직 승인되지 않은 매장입니다.' }, { status: 400 });
      }
      if (storeData.status === 'rejected') {
        return NextResponse.json({ error: '거절된 매장입니다.' }, { status: 400 });
      }

      const existSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', uid)
        .where('storeId', '==', storeId)
        .get();

      if (!existSnap.empty) {
        const existing = existSnap.docs[0].data();
        return NextResponse.json({
          error: existing.status === 'pending'
            ? '이미 승인 대기 중입니다.'
            : '이미 해당 매장에 소속되어 있습니다.',
        }, { status: 409 });
      }

      await adminDb.collection('user_store_map').add({
        uid,
        storeId,
        role: 'staff',
        groupId: 'staff',
        status: 'pending',
        appliedAt: FieldValue.serverTimestamp(),
        linkedAt: null,
        unlinkedAt: null,
      });

      return NextResponse.json({ success: true, store: { storeId, ...storeDoc.data() } });
    }

    // 기존 매장 연결 (슈퍼유저용 즉시 active)
    if (action === 'link') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

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
          role: 'staff',
          groupId: 'staff',
          linkedAt: FieldValue.serverTimestamp(),
          unlinkedAt: null,
        });
      } else {
        await adminDb.collection('user_store_map').add({
          uid,
          storeId,
          role: 'staff',
          groupId: 'staff',
          status: 'active',
          linkedAt: FieldValue.serverTimestamp(),
          unlinkedAt: null,
        });
      }

      return NextResponse.json({ success: true, store: { storeId, ...storeDoc.data() } });
    }

    // 멤버 승인 (슈퍼유저 전용)
    if (action === 'approve') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

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

      const mapData = snap.docs[0].data();
      const role = normalizeRole(mapData.role || 'staff');
      const groupId = normalizeGroupId(mapData.groupId || roleToGroupId(role));

      await snap.docs[0].ref.update({
        status: 'active',
        role,
        groupId,
        linkedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    // 멤버 거절 (슈퍼유저 전용)
    if (action === 'reject') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

      const { targetUid, storeId, reason } = body;
      if (!targetUid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const snap = await adminDb.collection('user_store_map')
        .where('uid', '==', targetUid)
        .where('storeId', '==', storeId)
        .get();

      if (!snap.empty) {
        await snap.docs[0].ref.update({
          status: 'rejected',
          rejectedReason: reason || '',
          rejectedAt: FieldValue.serverTimestamp(),
        });
      }

      return NextResponse.json({ success: true });
    }

    // 매장 승인 (슈퍼유저 전용)
    if (action === 'approveStore') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

      const { storeId } = body;
      if (!storeId) return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });

      const storeRef = adminDb.collection('stores').doc(storeId);
      const storeDoc = await storeRef.get();
      if (!storeDoc.exists) return NextResponse.json({ error: '매장 없음' }, { status: 404 });

      await storeRef.update({
        status: 'active',
        approvedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      const mapSnap = await adminDb.collection('user_store_map')
        .where('storeId', '==', storeId)
        .where('status', '==', 'pending')
        .get();
      for (const mapDoc of mapSnap.docs) {
        const role = normalizeRole(mapDoc.data().role);
        if (role !== 'superuser') continue;
        await mapDoc.ref.update({
          status: 'active',
          role: 'superuser',
          groupId: 'superuser',
          linkedAt: FieldValue.serverTimestamp(),
        });
      }

      return NextResponse.json({ success: true });
    }

    // 매장 거절 (슈퍼유저 전용)
    if (action === 'rejectStore') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

      const { storeId, reason } = body;
      if (!storeId) return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });

      await adminDb.collection('stores').doc(storeId).update({
        status: 'rejected',
        rejectedReason: reason || '',
        rejectedAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });

      return NextResponse.json({ success: true });
    }

    // 매장 삭제 (슈퍼유저 전용)
    if (action === 'deleteStore') {
      const denied = await requireSuperuser(authUser);
      if (denied) return denied;

      const { storeId } = body;
      if (!storeId) return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });

      const mapSnap = await adminDb.collection('user_store_map')
        .where('storeId', '==', storeId)
        .get();
      const batch = adminDb.batch();
      mapSnap.docs.forEach(d => batch.delete(d.ref));
      batch.delete(adminDb.collection('stores').doc(storeId));
      await batch.commit();

      return NextResponse.json({ success: true });
    }

    // 역할 변경
    if (action === 'changeRole') {
      const { targetUid, storeId, role: rawRole } = body;
      if (!targetUid || !storeId || !rawRole) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const role = normalizeRole(rawRole);
      const groupId = roleToGroupId(role);

      if (role === 'superuser') {
        const denied = await requireSuperuser(authUser);
        if (denied) return denied;
      }

      const snap = await adminDb.collection('user_store_map')
        .where('uid', '==', targetUid)
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .get();

      if (snap.empty) {
        return NextResponse.json({ error: '해당 멤버를 찾을 수 없습니다.' }, { status: 404 });
      }

      await snap.docs[0].ref.update({
        role,
        groupId,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (role === 'superuser') {
        await adminDb.collection('users').doc(targetUid).update({
          role: 'superuser',
          groupId: 'superuser',
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }

      return NextResponse.json({ success: true, role, groupId });
    }

    // 멤버 내보내기
    if (action === 'remove') {
      const { targetUid, storeId } = body;
      if (!targetUid || !storeId) {
        return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
      }

      const snap = await adminDb.collection('user_store_map')
        .where('uid', '==', targetUid)
        .where('storeId', '==', storeId)
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
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, storeName, ownerName, regionSido, regionSigungu, region, address, phone, businessNumber, tradeAreaCode } = body;

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });
    }

    const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);
    if (!isSU) {
      const mapSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', authUser.uid)
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .get();
      if (mapSnap.empty) {
        return NextResponse.json({ error: '권한 없음' }, { status: 403 });
      }
      const role = normalizeRole(mapSnap.docs[0].data().role);
      if (!['superuser', 'admin'].includes(normalizeRole(role))) {
        return NextResponse.json({ error: '권한 없음' }, { status: 403 });
      }
    }

    await adminDb.collection('stores').doc(storeId).update({
      storeName,
      ownerName: ownerName || '',
      region,
      regionSido,
      regionSigungu,
      tradeAreaCode: (tradeAreaCode ?? '').trim(),
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
