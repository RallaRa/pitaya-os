import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';

export interface MarginTargetSettings {
  /** 매장 전체 목표 마진율 (0~1) */
  globalTargetMargin: number;
  /** 품목별 개별 목표 마진율 */
  itemTargets: Record<string, number>;
}

export const DEFAULT_MARGIN_TARGET_SETTINGS: MarginTargetSettings = {
  globalTargetMargin: 0.35,
  itemTargets: {},
};

export async function getMarginTargetSettings(storeId: string): Promise<MarginTargetSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const raw = (doc.data()?.margin_targets || {}) as Partial<MarginTargetSettings>;
  return {
    globalTargetMargin: Number(raw.globalTargetMargin ?? DEFAULT_MARGIN_TARGET_SETTINGS.globalTargetMargin) || 0.35,
    itemTargets: raw.itemTargets && typeof raw.itemTargets === 'object' ? raw.itemTargets : {},
  };
}

export async function saveMarginTargetSettings(
  storeId: string,
  patch: Partial<MarginTargetSettings>,
): Promise<MarginTargetSettings> {
  const current = await getMarginTargetSettings(storeId);
  const merged: MarginTargetSettings = {
    globalTargetMargin: patch.globalTargetMargin != null
      ? Number(patch.globalTargetMargin)
      : current.globalTargetMargin,
    itemTargets: patch.itemTargets != null ? patch.itemTargets : current.itemTargets,
  };

  await adminDb.collection('store_settings').doc(storeId).set(
    {
      storeId,
      margin_targets: merged,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return merged;
}

export function resolveItemTargetMargin(
  settings: MarginTargetSettings,
  itemId: string,
  itemMasterTarget?: number,
): number {
  if (settings.itemTargets[itemId] != null) {
    return Number(settings.itemTargets[itemId]);
  }
  if (itemMasterTarget != null && itemMasterTarget > 0) {
    return itemMasterTarget;
  }
  return settings.globalTargetMargin;
}
