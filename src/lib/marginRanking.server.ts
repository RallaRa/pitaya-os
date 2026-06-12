import { adminDb } from '@/lib/firebase/admin';
import { isWeightBasedItem } from '@/lib/costRatio';
import {
  getMarginTargetSettings,
  resolveItemTargetMargin,
  type MarginTargetSettings,
} from '@/lib/marginSettings';
import {
  buildMarginInsights,
  calcMarginRate,
  TARGET_TOLERANCE,
  type MarginItemRow,
  type MarginRankingResult,
} from '@/lib/marginRankingShared';

function buildItemRow(
  id: string,
  d: Record<string, unknown>,
  settings: MarginTargetSettings,
): Omit<MarginItemRow, 'rank'> | null {
  const buyPrice = Number(d.buyPrice || 0);
  const sellPrice = Number(d.kgSalePrice || d.sellPrice || 0);
  const marginRate = calcMarginRate(buyPrice, sellPrice);
  if (marginRate == null) return null;

  const masterTarget = Number(d.targetMargin || 0);
  const targetMargin = resolveItemTargetMargin(settings, id, masterTarget > 0 ? masterTarget : undefined);
  const achievementRate = targetMargin > 0 ? marginRate / targetMargin : 0;
  const meetsTarget = targetMargin > 0 && marginRate >= targetMargin - TARGET_TOLERANCE;

  return {
    id,
    name: String(d.cut || d.name || '품목'),
    category: String(d.category || ''),
    buyPrice,
    sellPrice,
    marginRate,
    targetMargin,
    achievementRate,
    meetsTarget,
    isEstimated: isWeightBasedItem(d),
  };
}

export async function computeMarginRanking(storeId: string): Promise<MarginRankingResult> {
  const settings = await getMarginTargetSettings(storeId);
  const snap = await adminDb.collection('items').where('storeId', '==', storeId).get();

  const raw: Omit<MarginItemRow, 'rank'>[] = [];
  for (const doc of snap.docs) {
    const row = buildItemRow(doc.id, doc.data() as Record<string, unknown>, settings);
    if (row) raw.push(row);
  }

  raw.sort((a, b) => b.marginRate - a.marginRate);
  const all: MarginItemRow[] = raw.map((r, i) => ({ ...r, rank: i + 1 }));

  const avgMargin = all.length
    ? all.reduce((s, r) => s + r.marginRate, 0) / all.length
    : null;

  const meetsCount = all.filter(r => r.meetsTarget).length;
  const achievementRate = all.length ? meetsCount / all.length : null;

  return {
    storeId,
    avgMargin,
    globalTargetMargin: settings.globalTargetMargin,
    achievementRate,
    itemCount: all.length,
    top10: all.slice(0, 10),
    bottom5: [...all].sort((a, b) => a.marginRate - b.marginRate).slice(0, 5),
    all,
    insights: buildMarginInsights(all, avgMargin, settings.globalTargetMargin),
    generatedAt: new Date().toISOString(),
  };
}
