import { adminDb } from '@/lib/firebase/admin';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { isWeightBasedItem } from '@/lib/costRatio';
import { fetchStoreDailyItemStatsSince } from '@/lib/storeDailyItemStats';
import { getStockThresholds } from '@/lib/pos/stockWarning.server';
import {
  buildTurnoverInsights,
  calcWeeklyTurnoverRate,
  classifyWeeklyTurnover,
  matchStockRow,
  suggestReorderQty,
  TURNOVER_TIER_LABELS,
  type InventoryTurnoverResult,
  type InventoryTurnoverRow,
  type TurnoverTrendWeek,
} from '@/lib/inventoryTurnoverCalc';

const PERIOD_DAYS = 28;

function weekBuckets(dailyQty: Map<string, number>, today: string): TurnoverTrendWeek[] {
  const weeks: TurnoverTrendWeek[] = [];
  for (let w = 0; w < 4; w++) {
    const end = addDaysYMD(today, -w * 7);
    const start = addDaysYMD(end, -6);
    let sold = 0;
    let cur = start;
    while (cur <= end) {
      sold += dailyQty.get(cur) || 0;
      cur = addDaysYMD(cur, 1);
    }
    weeks.unshift({
      weekLabel: `W${4 - w}`,
      soldQty: Math.round(sold * 10) / 10,
      turnoverRate: 0,
    });
  }
  return weeks;
}

export async function computeInventoryTurnover(storeId: string): Promise<InventoryTurnoverResult> {
  const today = getKSTTodayYMD();
  const since = addDaysYMD(today, -(PERIOD_DAYS - 1));

  const [itemsSnap, dayStats, thresholds] = await Promise.all([
    adminDb.collection('items').where('storeId', '==', storeId).get(),
    fetchStoreDailyItemStatsSince(storeId, since, today),
    getStockThresholds(storeId),
  ]);

  const salesByItem = new Map<string, { qty: number; amount: number; daily: Map<string, number> }>();

  for (const day of dayStats) {
    for (const row of Object.values(day.items || {})) {
      const name = String(row.name || '').trim();
      if (!name) continue;
      if (!salesByItem.has(name)) {
        salesByItem.set(name, { qty: 0, amount: 0, daily: new Map() });
      }
      const entry = salesByItem.get(name)!;
      const qty = Number(row.qty || 0);
      entry.qty += qty;
      entry.amount += Number(row.amount || 0);
      entry.daily.set(day.date, (entry.daily.get(day.date) || 0) + qty);
    }
  }

  const rows: InventoryTurnoverRow[] = [];

  for (const doc of itemsSnap.docs) {
    const d = doc.data() as Record<string, unknown>;
    const name = String(d.cut || d.name || '').trim();
    if (!name) continue;

    const sales = salesByItem.get(name) || salesByItem.get(
      [...salesByItem.keys()].find(k => k.includes(name) || name.includes(k)) || '',
    );
    const soldQty28d = sales?.qty || 0;
    const buyPrice = Number(d.buyPrice || 0);
    const cogs28d = Math.round(soldQty28d * buyPrice);
    const stock = matchStockRow(name, thresholds);
    const avgInventory = stock
      ? Math.max(stock.openingQty * 0.5, stock.openingQty - soldQty28d / PERIOD_DAYS)
      : Math.max(1, soldQty28d / 14);
    const weeklyTurnover = calcWeeklyTurnoverRate(soldQty28d, avgInventory);
    const tier = classifyWeeklyTurnover(weeklyTurnover);
    const weeklySold = soldQty28d / 4;
    const estimatedStock = stock ? Math.max(0, stock.openingQty - soldQty28d / 7) : avgInventory;
    const reorderSuggestion = suggestReorderQty(weeklySold, estimatedStock, tier);

    const trend = weekBuckets(sales?.daily || new Map(), today);
    trend.forEach(t => {
      t.turnoverRate = calcWeeklyTurnoverRate(t.soldQty * 4, avgInventory);
    });

    let alert: 'overstock' | 'understock' | null = null;
    if (stock) {
      if (estimatedStock <= stock.alertBelowQty) alert = 'understock';
      else if (tier === 'low' && estimatedStock > stock.openingQty * 0.7) alert = 'overstock';
    }

    if (soldQty28d <= 0 && !stock) continue;

    rows.push({
      itemId: doc.id,
      itemName: name,
      soldQty28d: Math.round(soldQty28d * 10) / 10,
      cogs28d,
      avgInventory: Math.round(avgInventory * 10) / 10,
      weeklyTurnover,
      tier,
      tierLabel: TURNOVER_TIER_LABELS[tier],
      isEstimated: isWeightBasedItem(d) || !stock,
      trend,
      reorderSuggestion,
      unit: stock?.unit || 'kg',
      alert,
    });
  }

  for (const [name, sales] of salesByItem.entries()) {
    if (rows.some(r => r.itemName === name)) continue;
    if (sales.qty <= 0) continue;
    const stock = matchStockRow(name, thresholds);
    const avgInventory = stock?.openingQty || Math.max(1, sales.qty / 14);
    const weeklyTurnover = calcWeeklyTurnoverRate(sales.qty, avgInventory);
    const tier = classifyWeeklyTurnover(weeklyTurnover);
    rows.push({
      itemId: name,
      itemName: name,
      soldQty28d: sales.qty,
      cogs28d: 0,
      avgInventory,
      weeklyTurnover,
      tier,
      tierLabel: TURNOVER_TIER_LABELS[tier],
      isEstimated: true,
      trend: weekBuckets(sales.daily, today),
      reorderSuggestion: suggestReorderQty(sales.qty / 4, avgInventory, tier),
      unit: stock?.unit || 'kg',
      alert: null,
    });
  }

  rows.sort((a, b) => b.weeklyTurnover - a.weeklyTurnover);

  return {
    storeId,
    periodDays: PERIOD_DAYS,
    items: rows,
    highCount: rows.filter(r => r.tier === 'high').length,
    mediumCount: rows.filter(r => r.tier === 'medium').length,
    lowCount: rows.filter(r => r.tier === 'low').length,
    insights: buildTurnoverInsights(rows),
    generatedAt: new Date().toISOString(),
  };
}
