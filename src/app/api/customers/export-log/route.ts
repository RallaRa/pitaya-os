import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const storeId = String(body.storeId || '');
  const mode = String(body.mode || 'masked');
  const rowCount = Number(body.rowCount || 0);

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  await adminDb.collection('customer_export_logs').add({
    storeId,
    uid: user.uid,
    mode,
    rowCount,
    filters: body.filters || {},
    createdAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ success: true });
}
