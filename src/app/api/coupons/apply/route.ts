import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';
import {
  calculateCouponDiscount,
  todayKST,
  validateCouponRules,
} from '@/lib/coupons/couponRules';
import { discountLabel } from '@/lib/coupons/types';
import {
  inferCampaignKey,
  parseMessageLogs,
} from '@/lib/coupons/campaignAnalytics';
import { markBirthdayCouponRedeemed } from '@/lib/birthdayCampaign.server';

/** POST — 직원이 수동으로 쿠폰 적용 (사용 카운트·이력 기록) */
export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    storeId?: string;
    couponId?: string;
    orderAmount?: number;
    note?: string;
    customerCusCode?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = body.storeId?.trim() || '';
  const couponId = body.couponId?.trim() || '';
  const orderAmount = Number(body.orderAmount) || 0;

  if (!storeId || !couponId) {
    return NextResponse.json({ error: 'storeId, couponId required' }, { status: 400 });
  }
  if (orderAmount <= 0) {
    return NextResponse.json({ error: '주문금액을 입력해 주세요' }, { status: 400 });
  }

  const groupId = await getActualGroupId(authUser.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const ref = adminDb.collection('coupons').doc(couponId);
  const snap = await ref.get();
  if (!snap.exists || snap.data()?.storeId !== storeId) {
    return NextResponse.json({ error: '쿠폰을 찾을 수 없습니다' }, { status: 404 });
  }

  const data = snap.data()!;
  const check = validateCouponRules(data, orderAmount);
  if (check.ok === false) {
    return NextResponse.json({ error: check.message }, { status: 400 });
  }

  const discount = calculateCouponDiscount(data, orderAmount);
  const ymd = todayKST();

  const msgSnap = await adminDb.collection('customer_message_logs')
    .where('storeId', '==', storeId)
    .orderBy('createdAt', 'desc')
    .limit(300)
    .get();
  const messageLogs = parseMessageLogs(msgSnap.docs);
  const campaignKey = inferCampaignKey(String(data.code || ''), Date.now(), messageLogs);

  const logRef = adminDb.collection('coupon_redemption_logs').doc();
  await adminDb.runTransaction(async tx => {
    const fresh = await tx.get(ref);
    if (!fresh.exists) throw new Error('쿠폰을 찾을 수 없습니다');
    const d = fresh.data()!;
    const recheck = validateCouponRules(d, orderAmount);
    if (recheck.ok === false) throw new Error(recheck.message);

    tx.update(ref, {
      usedCount: FieldValue.increment(1),
      lastAppliedAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    tx.set(logRef, {
      storeId,
      couponId,
      code: d.code,
      title: d.title || '',
      type: d.type,
      value: d.value,
      orderAmount,
      discountAmount: discount,
      netAfterDiscount: Math.max(0, orderAmount - discount),
      appliedBy: authUser.uid,
      appliedByEmail: authUser.email || '',
      note: body.note ? String(body.note).trim().slice(0, 200) : '',
      customerCusCode: body.customerCusCode ? String(body.customerCusCode).trim().slice(0, 32) : '',
      campaignKey,
      ymd,
      appliedAt: FieldValue.serverTimestamp(),
    });
  });

  const cusCode = body.customerCusCode ? String(body.customerCusCode).trim().slice(0, 32) : '';
  if (cusCode && String(data.code || '').startsWith('BDAY')) {
    await markBirthdayCouponRedeemed(storeId, cusCode, logRef.id, couponId).catch(() => {});
  }

  return NextResponse.json({
    ok: true,
    logId: logRef.id,
    code: data.code,
    discount,
    orderAmount,
    netAfterDiscount: Math.max(0, orderAmount - discount),
    message: `${discountLabel(data.type, data.value)} · ${discount.toLocaleString('ko-KR')}원 적용 기록`,
    campaignKey: campaignKey || null,
  });
}
