import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

export interface CostRatioSettings {
  /** 매장 전체 목표 원가율 (0~1) */
  globalTargetRatio: number;
  /** 품목별 개별 목표 원가율 */
  itemTargets: Record<string, number>;
}

export const DEFAULT_COST_RATIO_SETTINGS: CostRatioSettings = {
  globalTargetRatio: 0.65,
  itemTargets: {},
};

export async function getCostRatioSettings(storeId: string): Promise<CostRatioSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = (doc.data()?.cost_ratio_targets || {}) as Partial<CostRatioSettings>;
  return {
    globalTargetRatio: Number(raw.globalTargetRatio ?? DEFAULT_COST_RATIO_SETTINGS.globalTargetRatio) || 0.65,
    itemTargets: raw.itemTargets && typeof raw.itemTargets === 'object' ? raw.itemTargets : {},
  };
}

export async function saveCostRatioSettings(
  storeId: string,
  patch: Partial<CostRatioSettings>,
): Promise<CostRatioSettings> {
  const current = await getCostRatioSettings(storeId);
  const merged: CostRatioSettings = {
    globalTargetRatio: patch.globalTargetRatio != null
      ? Number(patch.globalTargetRatio)
      : current.globalTargetRatio,
    itemTargets: patch.itemTargets != null ? patch.itemTargets : current.itemTargets,
  };

  await adminDb.collection('store_settings').doc(storeId).set(
    {
      storeId,
      cost_ratio_targets: merged,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return merged;
}

export function resolveItemTargetRatio(
  settings: CostRatioSettings,
  itemId: string,
  itemAppliedCost?: number,
): number {
  if (settings.itemTargets[itemId] != null) {
    return Number(settings.itemTargets[itemId]);
  }
  if (itemAppliedCost != null && itemAppliedCost > 0) {
    return itemAppliedCost;
  }
  return settings.globalTargetRatio;
}
