/** kg/g 등 중량 단위 — 소수점 2자리 */
export function isWeightUnit(unit: string): boolean {
  const u = String(unit || '').trim().toLowerCase();
  return u === 'kg' || u === 'g' || u === '';
}

export function normalizePurchaseQty(qty: number, unit: string): number {
  const n = Number(qty) || 0;
  if (!n) return 0;
  if (isWeightUnit(unit)) return Math.round(n * 100) / 100;
  return n;
}

export function formatPurchaseQty(qty: number, unit: string): string {
  const n = Number(qty) || 0;
  if (!n) return '';
  if (isWeightUnit(unit)) return n.toFixed(2);
  return String(n);
}

export function parsePurchaseQtyInput(raw: string, unit: string): number {
  const cleaned = String(raw || '').replace(/,/g, '').trim();
  if (!cleaned) return 0;
  const n = parseFloat(cleaned);
  if (!Number.isFinite(n)) return 0;
  return normalizePurchaseQty(n, unit);
}
