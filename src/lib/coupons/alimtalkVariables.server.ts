import { adminDb } from '@/lib/firebase/admin';
import type { CouponDoc } from '@/lib/coupons/types';
import { buildAlimtalkFromCoupon, type AlimtalkCouponPayload } from '@/lib/coupons/alimtalkVariables';

export async function resolveCouponForAlimtalk(
  storeId: string,
  couponId: string,
): Promise<AlimtalkCouponPayload | null> {
  const snap = await adminDb.collection('coupons').doc(couponId).get();
  if (!snap.exists) return null;
  const data = snap.data() as CouponDoc;
  if (data.storeId !== storeId) return null;
  if (data.isActive === false) return null;
  return buildAlimtalkFromCoupon({ id: snap.id, ...data });
}
