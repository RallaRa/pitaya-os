import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { generatePublicToken } from '@/lib/publicOrders';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const snap = await adminDb.collection('public_order_sessions')
      .where('storeId', '==', storeId)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const sessions = snap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        title: data.title,
        description: data.description || '',
        status: data.status,
        publicToken: data.publicToken,
        orderDeadline: data.orderDeadline || null,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
        updatedAt: data.updatedAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({ sessions });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; title?: string; description?: string; orderDeadline?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = (body.storeId || '').trim();
  const title = (body.title || '').trim();
  if (!storeId || !title) {
    return NextResponse.json({ error: 'storeId와 title이 필요합니다' }, { status: 400 });
  }

  try {
    const publicToken = generatePublicToken();
    const ref = await adminDb.collection('public_order_sessions').add({
      storeId,
      title,
      description: (body.description || '').trim(),
      status: 'draft',
      publicToken,
      orderDeadline: body.orderDeadline || null,
      createdBy: authUser.uid,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      id: ref.id,
      publicToken,
      publicUrl: `/order/${publicToken}`,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
