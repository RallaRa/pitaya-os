import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

// Kiosk-facing coupon validation — no auth token required (public endpoint with rate limiting via storeId + code)
// Coupon schema in Firestore `coupons` collection:
//   code: string (unique per store)
//   storeId: string
//   type: 'percent' | 'fixed'        — percent off or fixed KRW discount
//   value: number                     — % or KRW amount
//   minAmount: number                 — minimum order amount to apply
//   maxDiscount?: number              — cap for percent-type
//   startDate: string (YYYY-MM-DD)
//   endDate: string (YYYY-MM-DD)
//   usedCount: number
//   maxUse: number                    — 0 = unlimited
//   isActive: boolean

function todayKST(): string {
  const d = new Date(Date.now() + 9 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

export async function POST(req: Request) {
  let body: { code?: string; storeId?: string; amount?: number };
  try { body = await req.json(); } catch { return NextResponse.json({ valid: false, message: '잘못된 요청입니다' }, { status: 400 }); }

  const code    = (body.code    || '').trim().toUpperCase();
  const storeId = (body.storeId || '').trim();
  const amount  = Number(body.amount) || 0;

  if (!code || !storeId) {
    return NextResponse.json({ valid: false, message: '쿠폰코드와 매장ID가 필요합니다' }, { status: 400 });
  }

  // Lookup: storeId + code composite
  const snap = await adminDb.collection('coupons')
    .where('storeId', '==', storeId)
    .where('code', '==', code)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ valid: false, message: '쿠폰을 찾을 수 없습니다' });
  }

  const doc  = snap.docs[0];
  const data = doc.data();
  const today = todayKST();

  if (!data.isActive) {
    return NextResponse.json({ valid: false, message: '비활성 쿠폰입니다' });
  }
  if (data.startDate && today < data.startDate) {
    return NextResponse.json({ valid: false, message: `사용 시작일은 ${data.startDate} 입니다` });
  }
  if (data.endDate && today > data.endDate) {
    return NextResponse.json({ valid: false, message: '쿠폰 유효기간이 만료되었습니다' });
  }
  if (data.maxUse > 0 && (data.usedCount || 0) >= data.maxUse) {
    return NextResponse.json({ valid: false, message: '쿠폰 사용 한도에 도달했습니다' });
  }
  if (data.minAmount > 0 && amount < data.minAmount) {
    return NextResponse.json({
      valid: false,
      message: `최소 주문금액 ${data.minAmount.toLocaleString()}원 이상이어야 합니다`,
    });
  }

  // Calculate discount
  let discount = 0;
  if (data.type === 'percent') {
    discount = Math.round(amount * (data.value / 100));
    if (data.maxDiscount > 0) discount = Math.min(discount, data.maxDiscount);
  } else {
    discount = Math.min(data.value, amount);
  }

  return NextResponse.json({
    valid: true,
    discount,
    type: data.type,
    value: data.value,
    code,
    message: `${data.type === 'percent' ? `${data.value}% 할인` : `${data.value.toLocaleString()}원 할인`} 적용`,
    couponId: doc.id,
  });
}

// Redeem — call after payment confirmed
export async function PUT(req: Request) {
  let body: { couponId?: string; storeId?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: '잘못된 요청' }, { status: 400 }); }

  const { couponId, storeId } = body;
  if (!couponId || !storeId) return NextResponse.json({ error: '필수 파라미터 누락' }, { status: 400 });

  const ref = adminDb.collection('coupons').doc(couponId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.storeId !== storeId) {
    return NextResponse.json({ error: '쿠폰을 찾을 수 없습니다' }, { status: 404 });
  }

  await ref.update({
    usedCount: FieldValue.increment(1),
    lastUsedAt: FieldValue.serverTimestamp(),
  });

  return NextResponse.json({ ok: true });
}
