export type TurnoverTier = 'high' | 'medium' | 'low';

export interface TurnoverTrendWeek {
  weekLabel: string;
  soldQty: number;
  turnoverRate: number;
}

export interface InventoryTurnoverRow {
  itemId: string;
  itemName: string;
  soldQty28d: number;
  cogs28d: number;
  avgInventory: number;
  weeklyTurnover: number;
  tier: TurnoverTier;
  tierLabel: string;
  isEstimated: boolean;
  trend: TurnoverTrendWeek[];
  reorderSuggestion: number;
  unit: string;
  alert?: 'overstock' | 'understock' | null;
}

export interface InventoryTurnoverResult {
  storeId: string;
  periodDays: number;
  items: InventoryTurnoverRow[];
  highCount: number;
  mediumCount: number;
  lowCount: number;
  insights: string[];
  generatedAt: string;
}

export function classifyWeeklyTurnover(turnsPerWeek: number): TurnoverTier {
  if (turnsPerWeek >= 3) return 'high';
  if (turnsPerWeek >= 1) return 'medium';
  return 'low';
}

export const TURNOVER_TIER_LABELS: Record<TurnoverTier, string> = {
  high: '높음 (주 3회+)',
  medium: '보통 (주 1~3회)',
  low: '낮음 (주 1회 미만)',
};

export function calcWeeklyTurnoverRate(soldQty28d: number, avgInventory: number): number {
  const weeklySold = soldQty28d / 4;
  if (avgInventory <= 0.01) return weeklySold > 0 ? 99 : 0;
  return Math.round((weeklySold / avgInventory) * 100) / 100;
}

export function suggestReorderQty(weeklySold: number, estimatedStock: number, tier: TurnoverTier): number {
  const targetDays = tier === 'high' ? 3 : tier === 'medium' ? 5 : 7;
  const target = weeklySold * (targetDays / 7);
  return Math.max(0, Math.round((target - estimatedStock) * 10) / 10);
}

export function buildTurnoverInsights(rows: InventoryTurnoverRow[]): string[] {
  const insights: string[] = [];
  const low = rows.filter(r => r.tier === 'low').slice(0, 3);
  const high = rows.filter(r => r.tier === 'high').slice(0, 3);
  const over = rows.filter(r => r.alert === 'overstock').slice(0, 2);
  const under = rows.filter(r => r.alert === 'understock').slice(0, 2);

  if (high.length) {
    insights.push(`고회전 TOP: ${high.map(r => r.itemName).join(', ')} — 발주·진열 유지`);
  }
  if (low.length) {
    insights.push(`저회전: ${low.map(r => r.itemName).join(', ')} — 프로모션·발주 축소 검토`);
  }
  if (under.length) {
    insights.push(`부족 재고: ${under.map(r => r.itemName).join(', ')} — 긴급 발주`);
  }
  if (over.length) {
    insights.push(`과잉 재고: ${over.map(r => r.itemName).join(', ')} — 판매 촉진`);
  }
  if (!insights.length) insights.push('품목별 판매·재고 임계값을 설정하면 발주 제안이 정확해집니다.');
  return insights.slice(0, 4);
}

function normalizeName(name: string): string {
  return String(name || '').trim().toLowerCase().replace(/\s+/g, '');
}

export function matchStockRow(
  itemName: string,
  thresholds: Array<{ itemName: string; openingQty: number; alertBelowQty: number; unit?: string }>,
): { openingQty: number; alertBelowQty: number; unit: string } | null {
  const key = normalizeName(itemName);
  const exact = thresholds.find(t => normalizeName(t.itemName) === key);
  if (exact) return { openingQty: exact.openingQty, alertBelowQty: exact.alertBelowQty, unit: exact.unit || 'kg' };
  const partial = thresholds.find(t =>
    key.includes(normalizeName(t.itemName)) || normalizeName(t.itemName).includes(key),
  );
  if (partial) return { openingQty: partial.openingQty, alertBelowQty: partial.alertBelowQty, unit: partial.unit || 'kg' };
  return null;
}
