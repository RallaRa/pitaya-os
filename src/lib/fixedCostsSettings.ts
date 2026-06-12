import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import {
  DEFAULT_FIXED_COSTS,
  parseFixedCosts,
  sumFixedCosts,
  type FixedCosts,
} from '@/lib/fixedCosts';

export interface BreakEvenMeta {
  monthKey: string;
  businessDays: number;
  closedDays?: string[];
}

export interface FixedCostsSettings {
  costs: FixedCosts;
  closedDays: string[];
  breakEvenMeta: BreakEvenMeta | null;
}

export async function loadFixedCostsSettings(storeId: string): Promise<FixedCostsSettings> {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  const data = doc.data() || {};
  const meta = data.break_even_meta as BreakEvenMeta | undefined;
  return {
    costs: parseFixedCosts(data.fixed_costs),
    closedDays: Array.isArray(data.closed_days) ? data.closed_days.map(String) : [],
    breakEvenMeta: meta?.monthKey ? meta : null,
  };
}

export async function saveFixedCosts(
  storeId: string,
  costs: Partial<FixedCosts>,
  closedDays?: string[],
): Promise<FixedCosts> {
  const current = parseFixedCosts((await adminDb.collection('store_settings').doc(storeId).get()).data()?.fixed_costs);
  const merged: FixedCosts = {
    rent: costs.rent != null ? Number(costs.rent) : current.rent,
    labor: costs.labor != null ? Number(costs.labor) : current.labor,
    admin: costs.admin != null ? Number(costs.admin) : current.admin,
    other: costs.other != null ? Number(costs.other) : current.other,
  };

  const patch: Record<string, unknown> = {
    storeId,
    fixed_costs: merged,
    updatedAt: FieldValue.serverTimestamp(),
  };
  if (closedDays != null) {
    patch.closed_days = closedDays.filter(Boolean);
  }

  await adminDb.collection('store_settings').doc(storeId).set(patch, { merge: true });
  return merged;
}

export async function saveBreakEvenMeta(storeId: string, meta: BreakEvenMeta): Promise<void> {
  await adminDb.collection('store_settings').doc(storeId).set(
    {
      storeId,
      break_even_meta: meta,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export { DEFAULT_FIXED_COSTS, sumFixedCosts };
