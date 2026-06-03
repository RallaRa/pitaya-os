import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { createHash } from 'crypto';

interface VisitBody {
  visitorId?: string;
}

function hashVisitorKey(sessionId: string, visitorId: string): string {
  return createHash('sha256')
    .update(`${sessionId}:${visitorId.trim()}`)
    .digest('hex')
    .slice(0, 32);
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  if (!token) {
    return NextResponse.json({ error: '링크가 올바르지 않습니다' }, { status: 400 });
  }

  let body: VisitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const visitorId = (body.visitorId || '').trim();
  if (!visitorId || visitorId.length > 64) {
    return NextResponse.json({ error: 'visitorId required' }, { status: 400 });
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
    if (session.status === 'draft') {
      return NextResponse.json({ error: '아직 공개되지 않은 주문입니다' }, { status: 403 });
    }

    const sessionId = sessionDoc.id;
    const sessionRef = sessionDoc.ref;
    const visitorKey = hashVisitorKey(sessionId, visitorId);
    const visitRef = adminDb.collection('public_order_session_visitors').doc(visitorKey);

    let visitorCount = Number(session.visitorCount) || 0;
    let isNew = false;

    await adminDb.runTransaction(async (tx) => {
      const visitSnap = await tx.get(visitRef);
      if (visitSnap.exists) return;

      isNew = true;
      tx.set(visitRef, {
        sessionId,
        storeId: session.storeId,
        createdAt: FieldValue.serverTimestamp(),
      });
      tx.update(sessionRef, {
        visitorCount: FieldValue.increment(1),
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    if (isNew) visitorCount += 1;

    return NextResponse.json({ success: true, visitorCount, isNew });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
