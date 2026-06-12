import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import type { CouponDiscountType } from '@/lib/coupons/types';

export interface BirthdayCampaignSettings {
  enabled: boolean;
  /** fixed = 원 할인, percent = % 할인 */
  couponType: CouponDiscountType;
  /** fixed 시 원, percent 시 % */
  couponValue: number;
  couponMinAmount: number;
  /** D-3 발급 후 유효 일수 */
  couponValidDays: number;
  d3QueueEnabled: boolean;
  d0MessengerEnabled: boolean;
}

export const DEFAULT_BIRTHDAY_SETTINGS: BirthdayCampaignSettings = {
  enabled: true,
  couponType: 'fixed',
  couponValue: 5000,
  couponMinAmount: 30000,
  couponValidDays: 14,
  d3QueueEnabled: true,
  d0MessengerEnabled: true,
};

export async function getBirthdayCampaignSettings(
  storeId: string,
): Promise<BirthdayCampaignSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = (doc.data()?.birthday_campaign || {}) as Partial<BirthdayCampaignSettings>;
  return {
    enabled: raw.enabled !== false,
    couponType: raw.couponType === 'percent' ? 'percent' : 'fixed',
    couponValue: Number(raw.couponValue ?? DEFAULT_BIRTHDAY_SETTINGS.couponValue) || 5000,
    couponMinAmount: Number(raw.couponMinAmount ?? DEFAULT_BIRTHDAY_SETTINGS.couponMinAmount) || 0,
    couponValidDays: Number(raw.couponValidDays ?? DEFAULT_BIRTHDAY_SETTINGS.couponValidDays) || 14,
    d3QueueEnabled: raw.d3QueueEnabled !== false,
    d0MessengerEnabled: raw.d0MessengerEnabled !== false,
  };
}

export async function saveBirthdayCampaignSettings(
  storeId: string,
  patch: Partial<BirthdayCampaignSettings>,
): Promise<BirthdayCampaignSettings> {
  const current = await getBirthdayCampaignSettings(storeId);
  const merged: BirthdayCampaignSettings = {
    enabled: patch.enabled ?? current.enabled,
    couponType: patch.couponType ?? current.couponType,
    couponValue: patch.couponValue != null ? Number(patch.couponValue) : current.couponValue,
    couponMinAmount: patch.couponMinAmount != null
      ? Number(patch.couponMinAmount)
      : current.couponMinAmount,
    couponValidDays: patch.couponValidDays != null
      ? Number(patch.couponValidDays)
      : current.couponValidDays,
    d3QueueEnabled: patch.d3QueueEnabled ?? current.d3QueueEnabled,
    d0MessengerEnabled: patch.d0MessengerEnabled ?? current.d0MessengerEnabled,
  };

  await adminDb.collection('store_settings').doc(storeId).set(
    {
      storeId,
      birthday_campaign: merged,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return merged;
}
