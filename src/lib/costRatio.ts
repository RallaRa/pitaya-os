import { adminDb } from '@/lib/firebase/admin';

export interface SupplierPriceRow {
  itemName: string;
  suppliers: { name: string; unitPrice: number; lastDate: string }[];
  minPrice: number;
  minSupplier: string;
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

export async function loadCostRatioSummary(storeId: string) {
  const itemsSnap = await adminDb.collection('items').where('storeId', '==', storeId).get();
  const offenders: Array<{
    id: string; name: string; actualRatio: number; targetRatio: number; buyPrice: number; sellPrice: number;
  }> = [];
  let sumActual = 0;
  let count = 0;

  for (const doc of itemsSnap.docs) {
    const d = doc.data();
    const buyPrice = Number(d.buyPrice || 0);
    const sellPrice = Number(d.kgSalePrice || d.sellPrice || 0);
    const targetRatio = Number(d.appliedCost || 0);
    const actual = calcActualCostRatio(buyPrice, sellPrice);
    if (actual == null) continue;
    count++;
    sumActual += actual;
    if (targetRatio > 0 && actual > targetRatio + 0.02) {
      offenders.push({
        id: doc.id,
        name: String(d.cut || d.name || '품목'),
        actualRatio: actual,
        targetRatio,
        buyPrice,
        sellPrice,
      });
    }
  }

  offenders.sort((a, b) => (b.actualRatio - b.targetRatio) - (a.actualRatio - a.targetRatio));

  return {
    storeAvgRatio: count ? sumActual / count : null,
    itemCount: count,
    offenders: offenders.slice(0, 10),
  };
}
