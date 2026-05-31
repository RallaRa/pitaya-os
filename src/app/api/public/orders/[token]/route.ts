import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { serializeLine } from '@/lib/publicOrders';

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: '링크가 올바르지 않습니다' }, { status: 400 });
  }

  try {
    const sessionSnap = await adminDb.collection('public_order_sessions')
      .where('publicToken', '==', token)
      .limit(1)
      .get();

    if (sessionSnap.empty) {
      return NextResponse.json({ error: '주문 페이지를 찾을 수 없습니다' }, { status: 404 });
    }

    const sessionDoc = sessionSnap.docs[0];
    const session = sessionDoc.data();
    const sessionId = sessionDoc.id;

    if (session.status === 'draft') {
      return NextResponse.json({ error: '아직 공개되지 않은 주문입니다' }, { status: 403 });
    }

    const linesSnap = await adminDb.collection('public_order_lines')
      .where('sessionId', '==', sessionId)
      .where('isActive', '==', true)
      .get();

    const lines = linesSnap.docs
      .map(d => serializeLine(d.id, d.data() as Record<string, unknown>))
      .sort((a, b) => a.sortOrder - b.sortOrder);

    let storeName = '';
    try {
      const storeDoc = await adminDb.collection('stores').doc(session.storeId).get();
      storeName = storeDoc.data()?.storeName || storeDoc.data()?.name || '';
    } catch { /* ignore */ }

    return NextResponse.json({
      session: {
        id: sessionId,
        title: session.title,
        description: session.description || '',
        status: session.status,
        orderDeadline: session.orderDeadline || null,
        storeName,
      },
      lines,
      isOpen: session.status === 'open',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
