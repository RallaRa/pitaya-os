import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';

const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || 'hipona00@gmail.com';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid     = searchParams.get('uid');
  const storeId = searchParams.get('storeId');

  if (!uid) return NextResponse.json({ layout: null });

  try {
    // 마스터 레이아웃 우선 조회 (storeId 있으면)
    if (storeId) {
      const masterDoc = await adminDb.collection('dashboard_layouts').doc(`${storeId}_master`).get();
      if (masterDoc.exists) {
        return NextResponse.json({
          layout: masterDoc.data()?.layout || null,
          activeWidgets: masterDoc.data()?.activeWidgets || null,
          isMaster: true,
        });
      }
    }

    // 마스터 없으면 개인 레이아웃
    const doc = await adminDb.collection('dashboard_layouts').doc(uid).get();
    if (!doc.exists) return NextResponse.json({ layout: null });
    return NextResponse.json({
      layout: doc.data()?.layout || null,
      activeWidgets: doc.data()?.activeWidgets || null,
      isMaster: false,
    });
  } catch {
    return NextResponse.json({ layout: null });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { uid, layout, activeWidgets, storeId } = await req.json();
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

    const isSuperuser = authUser.email === SUPERUSER_EMAIL;

    // 슈퍼유저 + storeId → 마스터 레이아웃 저장
    if (isSuperuser && storeId) {
      await adminDb.collection('dashboard_layouts').doc(`${storeId}_master`).set({
        layout, activeWidgets,
        updatedBy: uid,
        updatedAt: FieldValue.serverTimestamp(),
        storeId,
      });
      return NextResponse.json({ success: true, saved: 'master' });
    }

    // 일반 유저 → 개인 레이아웃 저장
    await adminDb.collection('dashboard_layouts').doc(uid).set({
      layout, activeWidgets, updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, saved: 'personal' });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
