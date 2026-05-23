import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const uid = searchParams.get('uid');
  if (!uid) return NextResponse.json({ layout: null });

  try {
    const doc = await adminDb.collection('dashboard_layouts').doc(uid).get();
    if (!doc.exists) return NextResponse.json({ layout: null });
    return NextResponse.json({ layout: doc.data()?.layout || null, activeWidgets: doc.data()?.activeWidgets || null });
  } catch (e: any) {
    return NextResponse.json({ layout: null });
  }
}

export async function PUT(req: Request) {
  try {
    const { uid, layout, activeWidgets } = await req.json();
    if (!uid) return NextResponse.json({ error: 'uid required' }, { status: 400 });

    await adminDb.collection('dashboard_layouts').doc(uid).set({
      layout, activeWidgets, updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
