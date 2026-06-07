import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { makeOrdererKey, maskPhone } from '@/lib/publicOrders';
import { notifyPublicOrderReceived } from '@/lib/publicOrderNotify';

interface SubmitBody {
  ordererName?: string;
  ordererPhone?: string;
  items?: { lineId: string; qty: number }[];
  note?: string;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let body: SubmitBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '잘못된 요청입니다' }, { status: 400 });
  }

  const ordererName = (body.ordererName || '').trim();
  const ordererPhone = (body.ordererPhone || '').trim().replace(/\s/g, '');
  const items = Array.isArray(body.items) ? body.items : [];

  if (!ordererName || ordererPhone.length < 10) {
    return NextResponse.json({ error: '성함(닉네임)과 전화번호(10자리 이상)를 입력해 주세요' }, { status: 400 });
  }
  if (items.length === 0) {
    return NextResponse.json({ error: '주문할 품목을 선택해 주세요' }, { status: 400 });
  }

  const mergedItems = new Map<string, number>();
  for (const item of items) {
    const lineId = String(item.lineId || '').trim();
    const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
    if (!lineId || qty <= 0) continue;
    mergedItems.set(lineId, (mergedItems.get(lineId) || 0) + qty);
  }
  const normalizedItems = [...mergedItems.entries()].map(([lineId, qty]) => ({ lineId, qty }));
  if (normalizedItems.length === 0) {
    return NextResponse.json({ error: '주문할 품목을 선택해 주세요' }, { status: 400 });
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

    if (session.status !== 'open') {
      return NextResponse.json({ error: '현재 주문을 받지 않습니다' }, { status: 403 });
    }

    const ordererKey = makeOrdererKey(sessionId, ordererName, ordererPhone);
    const phoneMasked = maskPhone(ordererPhone);

    const { entryLines, totalAmount } = await adminDb.runTransaction(async (tx) => {
      type PendingLine = {
        lineRef: FirebaseFirestore.DocumentReference;
        lineId: string;
        qty: number;
        orderedQty: number;
        lineData: FirebaseFirestore.DocumentData;
      };

      const pending: PendingLine[] = [];
      const lineRefs = normalizedItems.map(item =>
        adminDb.collection('public_order_lines').doc(item.lineId),
      );
      const lineSnaps = lineRefs.length > 0 ? await tx.getAll(...lineRefs) : [];

      for (let i = 0; i < normalizedItems.length; i++) {
        const item = normalizedItems[i];
        const qty = Math.max(0, Math.floor(Number(item.qty) || 0));
        if (qty <= 0) continue;

        const lineSnap = lineSnaps[i];
        if (!lineSnap?.exists) throw new Error('품목을 찾을 수 없습니다');

        const lineData = lineSnap.data()!;
        if (lineData.sessionId !== sessionId || lineData.isActive === false) {
          throw new Error(`${lineData.name || '품목'}은 주문할 수 없습니다`);
        }

        const totalQty = Number(lineData.totalQty) || 0;
        const orderedQty = Number(lineData.orderedQty) || 0;
        const remaining = totalQty - orderedQty;

        if (qty > remaining) {
          throw new Error(
            `${lineData.name}: 잔량 ${remaining}${lineData.unit || ''} — 요청 ${qty} 초과`,
          );
        }

        pending.push({
          lineRef: lineRefs[i],
          lineId: item.lineId,
          qty,
          orderedQty,
          lineData,
        });
      }

      if (pending.length === 0) {
        throw new Error('유효한 주문 수량이 없습니다');
      }

      const entryLines: {
        lineId: string;
        name: string;
        qty: number;
        unitPrice: number;
        unit: string;
      }[] = [];
      let totalAmount = 0;

      for (const { lineId, qty, lineData } of pending) {
        const unitPrice = Number(lineData.discountPrice) || Number(lineData.normalPrice) || 0;
        entryLines.push({
          lineId,
          name: String(lineData.name || ''),
          qty,
          unitPrice,
          unit: String(lineData.unit || 'ea'),
        });
        totalAmount += unitPrice * qty;
      }

      for (const { lineRef, qty, orderedQty } of pending) {
        tx.update(lineRef, {
          orderedQty: orderedQty + qty,
          updatedAt: FieldValue.serverTimestamp(),
        });
      }

      const entryRef = adminDb.collection('public_order_entries').doc();
      tx.set(entryRef, {
        sessionId,
        storeId: session.storeId,
        publicToken: token,
        ordererKey,
        ordererName,
        ordererPhoneMasked: phoneMasked,
        lines: entryLines,
        note: (body.note || '').trim().slice(0, 200),
        status: 'unconfirmed',
        totalAmount,
        createdAt: FieldValue.serverTimestamp(),
      });

      return { entryLines, totalAmount };
    });

    void notifyPublicOrderReceived({
      storeId: session.storeId,
      sessionId,
      sessionTitle: String(session.title || '공개 주문'),
      ordererName,
      ordererPhoneMasked: phoneMasked,
      totalAmount,
      lines: entryLines.map(l => ({
        name: l.name,
        qty: l.qty,
        unit: l.unit,
        unitPrice: l.unitPrice,
      })),
      note: (body.note || '').trim().slice(0, 200),
    });

    return NextResponse.json({
      success: true,
      ordererKey,
      totalAmount,
      message: '주문이 접수되었습니다',
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
