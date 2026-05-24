import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || 'global';

  try {
    const snap = await adminDb.collection('naver_trend_keywords').doc(storeId).get();
    if (!snap.exists) {
      return NextResponse.json({ keywordGroups: [], lastAutoUpdate: null, nextAutoUpdate: null });
    }
    return NextResponse.json(snap.data());
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { storeId = 'global', keywordGroups } = body;

    await adminDb.collection('naver_trend_keywords').doc(storeId).set(
      { keywordGroups, updatedAt: FieldValue.serverTimestamp() },
      { merge: true }
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
