import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { serializeLine, parsePublicOrderEntryStatus } from '@/lib/publicOrders';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ sessionId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { sessionId } = await params;
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  try {
    const doc = await adminDb.collection('public_order_sessions').doc(sessionId).get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data()!;
    if (storeId && data.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const linesSnap = await adminDb.collection('public_order_lines')
      .where('sessionId', '==', sessionId)
      .get();

    const lines = linesSnap.docs
      .map(d => serializeLine(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    const entriesSnap = await adminDb.collection('public_order_entries')
      .where('sessionId', '==', sessionId)
      .get();

    const entries = entriesSnap.docs
      .map(d => {
        const e = d.data();
        return {
          id: d.id,
          ordererName: e.ordererName,
          ordererPhoneMasked: e.ordererPhoneMasked,
          lines: e.lines,
          note: e.note || '',
          status: parsePublicOrderEntryStatus(e.status),
          totalAmount: e.totalAmount,
          createdAt: e.createdAt?.toDate?.()?.toISOString?.() ?? null,
          _sortMs: e.createdAt?.toMillis?.() ?? 0,
        };
      })
      .sort((a, b) => b._sortMs - a._sortMs)
      .slice(0, 100)
      .map(({ _sortMs: _, ...rest }) => rest);

    return NextResponse.json({
      session: {
        id: doc.id,
        storeId: data.storeId,
        title: data.title,
        description: data.description || '',
        status: data.status,
        publicToken: data.publicToken,
        orderDeadline: data.orderDeadline || null,
        visitorCount: Number(data.visitorCount) || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      },
      lines,
      entries,
      publicUrl: `/order/${data.publicToken}`,
    });
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
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('public_order_sessions').doc(sessionId);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const updates: Record<string, unknown> = { updatedAt: FieldValue.serverTimestamp() };
    if (body.title != null) updates.title = String(body.title).trim();
    if (body.description != null) updates.description = String(body.description).trim();
    if (body.orderDeadline != null) updates.orderDeadline = body.orderDeadline || null;
    if (body.status != null && ['draft', 'open', 'closed'].includes(String(body.status))) {
      updates.status = body.status;
    }

    await ref.update(updates);
    return NextResponse.json({ success: true });
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
  const storeId = searchParams.get('storeId') || '';

  try {
    const ref = adminDb.collection('public_order_sessions').doc(sessionId);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (storeId && doc.data()?.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    const batch = adminDb.batch();
    const lines = await adminDb.collection('public_order_lines').where('sessionId', '==', sessionId).get();
    lines.docs.forEach(d => batch.delete(d.ref));
    const entries = await adminDb.collection('public_order_entries').where('sessionId', '==', sessionId).get();
    entries.docs.forEach(d => batch.delete(d.ref));
    batch.delete(ref);
    await batch.commit();

    return NextResponse.json({ success: true });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
