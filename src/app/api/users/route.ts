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
        const { uid, role } = mapDoc.data();
        const userDoc = await adminDb.collection('users').doc(uid).get();
        if (userDoc.exists) {
          return { uid, role, ...userDoc.data() };
        }
        return { uid, role, name: uid, email: '' };
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

    // hipona00@gmail.com은 항상 superuser로 고정
    const finalRole = email === 'hipona00@gmail.com' ? 'superuser' : (role || 'staff');

    await adminDb.collection('users').doc(uid).set({
      uid,
      name: name || '',
      email: email || '',
      photoURL: photoURL || '',
      role: finalRole,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
