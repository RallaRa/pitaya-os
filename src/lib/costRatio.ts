import { adminDb } from '@/lib/firebase/admin';
import {
  getCostRatioSettings,
  resolveItemTargetRatio,
  type CostRatioSettings,
} from '@/lib/costRatioSettings';

export interface SupplierPriceRow {
  itemName: string;
  suppliers: { name: string; unitPrice: number; lastDate: string }[];
  minPrice: number;
  minSupplier: string;
}

export interface CostRatioItemRow {
  id: string;
  name: string;
  buyPrice: number;
  sellPrice: number;
  actualRatio: number;
  targetRatio: number;
  isOverTarget: boolean;
  isEstimated: boolean;
  category?: string;
}

export interface CostRatioDetail {
  storeAvgRatio: number | null;
  globalTargetRatio: number;
  itemCount: number;
  items: CostRatioItemRow[];
  offenders: CostRatioItemRow[];
}

export async function buildSupplierPriceCompare(storeId: string): Promise<SupplierPriceRow[]> {
  const snap = await adminDb.collection('item_prices').where('storeId', '==', storeId).get();
  const rows: SupplierPriceRow[] = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const lines: Array<{ supplierName?: string; unitPrice?: number; purchaseDate?: string }> =
      Array.isArray(data.lines) ? data.lines : [];
    const bySupplier = new Map<string, { unitPrice: number; lastDate: string }>();

    for (const line of lines) {
      const name = String(line.supplierName || '').trim();
      const price = Number(line.unitPrice || 0);
      const date = String(line.purchaseDate || '');
      if (!name || !price) continue;
      const prev = bySupplier.get(name);
      if (!prev || date >= prev.lastDate) {
        bySupplier.set(name, { unitPrice: price, lastDate: date });
      }
    }

    if (bySupplier.size < 2) continue;

    const suppliers = [...bySupplier.entries()].map(([name, v]) => ({
      name, unitPrice: v.unitPrice, lastDate: v.lastDate,
    }));
    const min = suppliers.reduce((a, b) => (a.unitPrice <= b.unitPrice ? a : b));

    rows.push({
      itemName: String(data.itemName || doc.id.replace(`${storeId}_`, '')),
      suppliers,
      minPrice: min.unitPrice,
      minSupplier: min.name,
    });
  }

  return rows.sort((a, b) => a.itemName.localeCompare(b.itemName));
}

export function calcActualCostRatio(buyPrice: number, sellPrice: number): number | null {
  if (!buyPrice || !sellPrice || sellPrice <= 0) return null;
  return buyPrice / sellPrice;
}

/** kg 기준 판매 품목 — 원가율 추정값 표시 */
export function isWeightBasedItem(data: Record<string, unknown>): boolean {
  if (data.pricingUnit === 'ea' || data.saleUnit === 'ea') return false;
  const cat = String(data.category || '');
  if (['양념', '음료', '반찬', '가공'].some(c => cat.includes(c))) return false;
  return !!(data.kgSalePrice || data.unit === 'kg');
}

const OVER_TOLERANCE = 0.02;

function buildItemRow(
  id: string,
  d: Record<string, unknown>,
  settings: CostRatioSettings,
): CostRatioItemRow | null {
  const buyPrice = Number(d.buyPrice || 0);
  const sellPrice = Number(d.kgSalePrice || d.sellPrice || 0);
  const actual = calcActualCostRatio(buyPrice, sellPrice);
  if (actual == null) return null;

  const appliedCost = Number(d.appliedCost || 0);
  const targetRatio = resolveItemTargetRatio(settings, id, appliedCost);
  const isOverTarget = targetRatio > 0 && actual > targetRatio + OVER_TOLERANCE;

  return {
    id,
    name: String(d.cut || d.name || '품목'),
    buyPrice,
    sellPrice,
    actualRatio: actual,
    targetRatio,
    isOverTarget,
    isEstimated: isWeightBasedItem(d),
    category: String(d.category || ''),
  };
}

export async function loadCostRatioDetail(storeId: string): Promise<CostRatioDetail> {
  const settings = await getCostRatioSettings(storeId);
  const itemsSnap = await adminDb.collection('items').where('storeId', '==', storeId).get();
  const items: CostRatioItemRow[] = [];
  let sumActual = 0;

  for (const doc of itemsSnap.docs) {
    const row = buildItemRow(doc.id, doc.data() as Record<string, unknown>, settings);
    if (!row) continue;
    items.push(row);
    sumActual += row.actualRatio;
  }

  items.sort((a, b) => b.actualRatio - a.actualRatio);
  const offenders = items
    .filter(i => i.isOverTarget)
    .sort((a, b) => (b.actualRatio - b.targetRatio) - (a.actualRatio - a.targetRatio));

  return {
    storeAvgRatio: items.length ? sumActual / items.length : null,
    globalTargetRatio: settings.globalTargetRatio,
    itemCount: items.length,
    items,
    offenders,
  };
}

/** @deprecated loadCostRatioDetail 사용 */
export async function loadCostRatioSummary(storeId: string) {
  const detail = await loadCostRatioDetail(storeId);
  return {
    storeAvgRatio: detail.storeAvgRatio,
    itemCount: detail.itemCount,
    globalTargetRatio: detail.globalTargetRatio,
    offenders: detail.offenders.slice(0, 10).map(o => ({
      id: o.id,
      name: o.name,
      actualRatio: o.actualRatio,
      targetRatio: o.targetRatio,
      buyPrice: o.buyPrice,
      sellPrice: o.sellPrice,
      isEstimated: o.isEstimated,
    })),
    items: detail.items,
  };
}
