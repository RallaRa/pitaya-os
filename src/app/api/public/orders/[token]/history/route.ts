import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const { searchParams } = new URL(req.url);
  const ordererKey = (searchParams.get('ordererKey') || '').trim();

  if (!token || !ordererKey) {
    return NextResponse.json({ error: 'ordererKey가 필요합니다' }, { status: 400 });
  }

  try {
    const sessionSnap = await adminDb.collection('public_order_sessions')
      .where('publicToken', '==', token)
      .limit(1)
      .get();

    if (sessionSnap.empty) {
      return NextResponse.json({ error: '주문 페이지를 찾을 수 없습니다' }, { status: 404 });
    }

    const sessionId = sessionSnap.docs[0].id;
    const session = sessionSnap.docs[0].data();

    const entriesSnap = await adminDb.collection('public_order_entries')
      .where('sessionId', '==', sessionId)
      .where('ordererKey', '==', ordererKey)
      .orderBy('createdAt', 'desc')
      .limit(50)
      .get();

    const entries = entriesSnap.docs.map(d => {
      const data = d.data();
      return {
        id: d.id,
        ordererName: data.ordererName,
        lines: data.lines || [],
        note: data.note || '',
        totalAmount: data.totalAmount || 0,
        createdAt: data.createdAt?.toDate?.()?.toISOString?.() ?? null,
      };
    });

    return NextResponse.json({
      sessionTitle: session.title,
      entries,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
