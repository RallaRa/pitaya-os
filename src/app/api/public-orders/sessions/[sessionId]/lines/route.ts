import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { serializeLine } from '@/lib/publicOrders';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const sessionDoc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (!sessionDoc.exists) return NextResponse.json({ error: 'Session not found' }, { status: 404 });
    const session = sessionDoc.data()!;

    const ref = await adminDb.collection('public_order_lines').add({
      sessionId,
      storeId: session.storeId,
      sortOrder: Number(body.sortOrder) || 0,
      name: String(body.name || '').trim(),
      description: String(body.description || '').trim(),
      origin: String(body.origin || '').trim(),
      photoUrl: String(body.photoUrl || '').trim(),
      normalPrice: Number(body.normalPrice) || 0,
      discountPrice: Number(body.discountPrice) || 0,
      unit: String(body.unit || 'ea').trim(),
      priceUnitLabel: String(body.priceUnitLabel || '').trim(),
      totalQty: Math.max(0, Math.floor(Number(body.totalQty) || 0)),
      orderedQty: 0,
      isActive: body.isActive !== false,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ id: ref.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  let body: { lineId?: string; [key: string]: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const lineId = body.lineId;
  if (!lineId) return NextResponse.json({ error: 'lineId required' }, { status: 400 });

  try {
    const ref = adminDb.collection('public_order_lines').doc(lineId);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Line not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    const fields = [
      'sortOrder', 'name', 'description', 'origin', 'photoUrl',
      'normalPrice', 'discountPrice', 'unit', 'priceUnitLabel', 'totalQty', 'isActive',
    ] as const;

    for (const f of fields) {
      if (body[f] !== undefined) {
        if (f === 'totalQty') {
          const newTotal = Math.max(0, Math.floor(Number(body.totalQty) || 0));
          const orderedQty = Number(doc.data()?.orderedQty) || 0;
          if (newTotal < orderedQty) {
            return NextResponse.json({
              error: `총수량은 이미 주문된 ${orderedQty}보다 작을 수 없습니다`,
            }, { status: 400 });
          }
          updates.totalQty = newTotal;
        } else if (typeof body[f] === 'string') {
          updates[f] = (body[f] as string).trim();
        } else {
          updates[f] = body[f];
        }
      }
    }

    await ref.update(updates);
    const updated = await ref.get();
    return NextResponse.json({
      line: serializeLine(updated.id, updated.data() as Record<string, unknown>),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const lineId = searchParams.get('lineId') || '';
  if (!lineId) return NextResponse.json({ error: 'lineId required' }, { status: 400 });

  try {
    const ref = adminDb.collection('public_order_lines').doc(lineId);
    const doc = await ref.get();
    if (!doc.exists || doc.data()?.sessionId !== sessionId) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }
    const orderedQty = Number(doc.data()?.orderedQty) || 0;
    if (orderedQty > 0) {
      await ref.update({ isActive: false, updatedAt: FieldValue.serverTimestamp() });
    } else {
      await ref.delete();
    }
    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
