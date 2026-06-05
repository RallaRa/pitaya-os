import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  calculateCouponDiscount,
  validateCouponRules,
} from '@/lib/coupons/couponRules';
import { discountLabel } from '@/lib/coupons/types';

export async function POST(req: Request) {
  let body: { code?: string; storeId?: string; amount?: number };
  try { body = await req.json(); } catch {
    return NextResponse.json({ valid: false, message: '잘못된 요청입니다' }, { status: 400 });
  }

  const code = (body.code || '').trim().toUpperCase();
  const storeId = (body.storeId || '').trim();
  const amount = Number(body.amount) || 0;

  if (!code || !storeId) {
    return NextResponse.json({ valid: false, message: '쿠폰코드와 매장ID가 필요합니다' }, { status: 400 });
  }

  const snap = await adminDb.collection('coupons')
    .where('storeId', '==', storeId)
    .where('code', '==', code)
    .limit(1)
    .get();

  if (snap.empty) {
    return NextResponse.json({ valid: false, message: '쿠폰을 찾을 수 없습니다' });
  }

  const doc = snap.docs[0];
  const data = doc.data();
  const check = validateCouponRules(data, amount);
  if (check.ok === false) {
    return NextResponse.json({ valid: false, message: check.message });
  }

  const discount = calculateCouponDiscount(data, amount);

  return NextResponse.json({
    valid: true,
    discount,
    type: data.type,
    value: data.value,
    code,
    message: `${discountLabel(data.type === 'fixed' ? 'fixed' : 'percent', data.value)} (미리보기)`,
    couponId: doc.id,
    staffApplyRequired: true,
  });
}

/** 자동 차감 비활성 — Pitaya 쿠폰 관리에서 직원이 「쿠폰 적용」으로 기록 */
export async function PUT() {
  return NextResponse.json(
    { error: '쿠폰 사용은 Pitaya 쿠폰 관리 → 쿠폰 적용 버튼으로 직원이 기록해야 합니다' },
    { status: 403 },
  );
}
