import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { getDashboardLayoutData } from '@/lib/dashboardLayoutServer';

const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || 'hipona00@gmail.com';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const uid     = searchParams.get('uid');
  const storeId = searchParams.get('storeId');

  if (!uid) return NextResponse.json({ layout: null });

  const data = await getDashboardLayoutData(uid, storeId);
  return NextResponse.json(data);
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { uid, layout, activeWidgets, storeId, layoutVersion } = await req.json();
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

    const isSuperuser = authUser.email === SUPERUSER_EMAIL;
    const payload = {
      layout,
      activeWidgets,
      layoutVersion: layoutVersion ?? 2,
      updatedAt: FieldValue.serverTimestamp(),
    };

    if (isSuperuser && storeId) {
      await adminDb.collection('dashboard_layouts').doc(`${storeId}_master`).set({
        ...payload,
        updatedBy: uid,
        storeId,
      });
      return NextResponse.json({ success: true, saved: 'master' });
    }

    await adminDb.collection('dashboard_layouts').doc(uid).set({
      ...payload,
    });

    return NextResponse.json({ success: true, saved: 'personal' });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
