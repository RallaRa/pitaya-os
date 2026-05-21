import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const storeId = searchParams.get('storeId');
    const uid = searchParams.get('uid');

    if (uid) {
      const userDoc = await adminDb.collection('users').doc(uid).get();
      if (!userDoc.exists) {
        return NextResponse.json({ error: '유저를 찾을 수 없습니다.' }, { status: 404 });
      }
      return NextResponse.json({ user: { uid, ...userDoc.data() } });
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
        const { uid, role, groupId: storeGroupId } = mapDoc.data();
        const userDoc = await adminDb.collection('users').doc(uid).get();
        const userData = userDoc.exists ? userDoc.data() : null;
        // 매장별 groupId 우선, 없으면 글로벌 groupId 사용
        const effectiveGroupId = storeGroupId || userData?.groupId || 'staff';
        if (userData) {
          return { ...userData, uid, role, groupId: effectiveGroupId };
        }
        return { uid, role, groupId: effectiveGroupId, name: uid, email: '' };
      })
    );

    return NextResponse.json({ users });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { uid, name, email, photoURL, role } = await req.json();
    if (!uid) {
      return NextResponse.json({ error: 'uid 없음' }, { status: 400 });
    }

    const existingDoc = await adminDb.collection('users').doc(uid).get();
    const existingData = existingDoc.exists ? existingDoc.data() : null;

    const finalRole = email === 'hipona00@gmail.com' ? 'superuser' : (role || existingData?.role || 'staff');
    const finalGroupId = email === 'hipona00@gmail.com' ? 'master' : (existingData?.groupId || 'staff');

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
  try {
    const body = await req.json();
    const { action, uid, storeId, groupId } = body;

    if (action !== 'assignGroup' || !uid || !groupId) {
      return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
    }

    if (storeId) {
      const mapSnap = await adminDb.collection('user_store_map')
        .where('uid', '==', uid)
        .where('storeId', '==', storeId)
        .get();
      if (!mapSnap.empty) {
        await mapSnap.docs[0].ref.update({ groupId, updatedAt: FieldValue.serverTimestamp() });
      }
    } else {
      await adminDb.collection('users').doc(uid).update({ groupId, updatedAt: FieldValue.serverTimestamp() });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
