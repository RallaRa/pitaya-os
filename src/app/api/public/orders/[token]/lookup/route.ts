import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { makeOrdererKey } from '@/lib/publicOrders';

/** 주문 내역 조회용 — ordererKey만 반환 (주문 생성 없음) */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let body: { ordererName?: string; ordererPhone?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청' }, { status: 400 });
  }

  const ordererName = (body.ordererName || '').trim();
  const ordererPhone = (body.ordererPhone || '').trim();
  if (!ordererName || ordererPhone.length < 10) {
    return NextResponse.json({ error: '이름과 연락처를 입력해 주세요' }, { status: 400 });
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
    const ordererKey = makeOrdererKey(sessionId, ordererName, ordererPhone);

    const entriesSnap = await adminDb.collection('public_order_entries')
      .where('sessionId', '==', sessionId)
      .where('ordererKey', '==', ordererKey)
      .limit(1)
      .get();

    if (entriesSnap.empty) {
      return NextResponse.json({ error: '해당 정보로 주문 내역이 없습니다' }, { status: 404 });
    }

    return NextResponse.json({ ordererKey });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
