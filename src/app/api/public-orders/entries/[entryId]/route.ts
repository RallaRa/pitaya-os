import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import {
  PUBLIC_ORDER_ENTRY_STATUSES,
  parsePublicOrderEntryStatus,
  type PublicOrderEntryStatus,
} from '@/lib/publicOrders';

export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ entryId: string }> },
) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { entryId } = await params;
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  let body: { status?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const nextStatus = body.status as PublicOrderEntryStatus | undefined;
  if (!nextStatus || !PUBLIC_ORDER_ENTRY_STATUSES.includes(nextStatus)) {
    return NextResponse.json({ error: '유효하지 않은 상태입니다' }, { status: 400 });
  }

  try {
    const ref = adminDb.collection('public_order_entries').doc(entryId);
    const doc = await ref.get();
    if (!doc.exists) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data = doc.data()!;
    if (storeId && data.storeId !== storeId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    await ref.update({
      status: nextStatus,
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({
      success: true,
      status: parsePublicOrderEntryStatus(nextStatus),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
