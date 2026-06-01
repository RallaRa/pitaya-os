import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { isPlatformSuperuser } from '@/lib/superuserCheck';
import { verifyToken } from '@/lib/authVerify';
import { sanitizeUserForClient } from '@/lib/kakao/linkAccount';
import {
  normalizeGroupId,
  normalizeRole,
  groupIdToRole,
  roleToGroupId,
} from '@/lib/roleMapping';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const uid = searchParams.get('uid');

    if (uid) {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 });
      }
      const data = userDoc.data()!;
      return NextResponse.json({
        user: sanitizeUserForClient({
          uid,
          ...data,
          role: normalizeRole(data.role),
          groupId: normalizeGroupId(data.groupId),
        }),
      });
    }

    if (!storeId) {
      return NextResponse.json({ error: 'storeId 없음' }, { status: 400 });
    }

    const mapSnap = await adminDb.collection('user_store_map')
      .where('storeId', '==', storeId)
      .where('status', '==', 'active')
      .get();

    if (mapSnap.empty) return NextResponse.json({ users: [] });

    const users = await Promise.all(
      mapSnap.docs.map(async (mapDoc) => {
        const { uid: memberUid, role, groupId: storeGroupId } = mapDoc.data();
        const userDoc = await adminDb.collection('users').doc(memberUid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        const hasStoreGroup = storeGroupId !== undefined && storeGroupId !== null;
        const effectiveGroupId = hasStoreGroup
          ? normalizeGroupId(storeGroupId)
          : roleToGroupId(role || userData?.role);
        if (userData) {
          return sanitizeUserForClient({
            ...userData,
            uid: memberUid,
            role: normalizeRole(role || userData.role),
            groupId: effectiveGroupId,
          });
        }
        return {
          uid: memberUid,
          role: normalizeRole(role),
          groupId: effectiveGroupId,
          name: memberUid,
          email: '',
        };
      })
    );

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { uid, name, email, photoURL, role } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: 'uid 없음' }, { status: 400 });
    }

    const existingDoc = await adminDb.collection('users').doc(uid).get();
    const existingData = existingDoc.exists ? existingDoc.data() : null;

    const isSU = isSuperuserEmail(email) || existingData?.role === 'superuser';
    const finalRole = isSU ? 'superuser' : normalizeRole(role || existingData?.role || 'user');
    const finalGroupId = isSU ? 'superuser' : normalizeGroupId(existingData?.groupId || 'staff');

    await adminDb.collection('users').doc(uid).set({
      uid,
      name: name || '',
      email: email || '',
      photoURL: photoURL || '',
      role: finalRole,
      groupId: finalGroupId,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { action, uid, storeId, groupId: rawGroupId } = body;

    if (action !== 'assignGroup' || !uid || rawGroupId === undefined) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    const groupId = rawGroupId === '' ? '' : normalizeGroupId(rawGroupId);

    if (groupId === 'superuser') {
      const isSU = await isPlatformSuperuser(authUser.uid, authUser.email);
      if (!isSU) {
        return NextResponse.json({ error: '슈퍼유저 역할은 슈퍼유저만 부여할 수 있습니다.' }, { status: 403 });
      }
    }

    if (storeId) {
      const mapSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', uid)
        .where('storeId', '==', storeId)
        .get();
      if (mapSnap.empty) {
        return NextResponse.json({ error: '해당 매장 멤버를 찾을 수 없습니다.' }, { status: 404 });
      }
      const roleFromGroup = groupId === '' ? 'staff' : groupIdToRole(groupId);
      await mapSnap.docs[0].ref.update({
        groupId,
        role: roleFromGroup,
        updatedAt: FieldValue.serverTimestamp(),
      });

      if (groupId === 'superuser') {
        await adminDb.collection('users').doc(uid).update({
          role: 'superuser',
          groupId: 'superuser',
          updatedAt: FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
    } else {
      await adminDb.collection('users').doc(uid).update({
        groupId,
        role: groupId === '' ? 'staff' : groupIdToRole(groupId),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
