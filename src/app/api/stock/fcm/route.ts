import { NextRequest, NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyStockSuperuser } from '@/lib/stock/superuserAuth';

export async function POST(req: NextRequest) {
  const auth = await verifyStockSuperuser(req);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = body.token?.trim();
  if (!token || token.length < 20) {
    return NextResponse.json({ error: 'Invalid FCM token' }, { status: 400 });
  }

  await adminDb.collection('users').doc(auth.user.uid).set(
    {
      fcmTokens: FieldValue.arrayUnion(token),
      fcmUpdatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const auth = await verifyStockSuperuser(req);
  if (auth.ok === false) {
    return NextResponse.json({ error: auth.reason }, { status: auth.status });
  }

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const token = body.token?.trim();
  if (token) {
    await adminDb.collection('users').doc(auth.user.uid).update({
      fcmTokens: FieldValue.arrayRemove(token),
    });
  }

  return NextResponse.json({ ok: true });
}
