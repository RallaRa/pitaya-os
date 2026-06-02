import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { DEFAULT_WEATHER_VARIABLES } from '@/lib/weatherImpactDefaults';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || 'global';
  try {
    const doc = await adminDb.collection('weather_impact_variables').doc(storeId).get();
    if (!doc.exists) {
      // 기본 변수 초기화
      await adminDb.collection('weather_impact_variables').doc(storeId).set({
        storeId, variables: DEFAULT_WEATHER_VARIABLES,
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ variables: DEFAULT_WEATHER_VARIABLES, seeded: true });
    }
    const data = doc.data();
    return NextResponse.json({
      variables: data?.variables || [],
      lastCalibratedAt: data?.lastCalibratedAt || null,
      calibrationMeta: data?.calibrationMeta || null,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const { storeId = 'global', variables } = await req.json();
    await adminDb.collection('weather_impact_variables').doc(storeId).set({
      storeId, variables, updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
