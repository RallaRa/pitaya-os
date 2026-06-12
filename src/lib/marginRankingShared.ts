export interface MarginItemRow {
  id: string;
  name: string;
  category: string;
  buyPrice: number;
  sellPrice: number;
  marginRate: number;
  targetMargin: number;
  achievementRate: number;
  meetsTarget: boolean;
  isEstimated: boolean;
  rank: number;
}

export interface MarginInsight {
  type: 'top_focus' | 'bottom_review' | 'avg_below_target';
  text: string;
}

export interface MarginRankingResult {
  storeId: string;
  avgMargin: number | null;
  globalTargetMargin: number;
  achievementRate: number | null;
  itemCount: number;
  top10: MarginItemRow[];
  bottom5: MarginItemRow[];
  all: MarginItemRow[];
  insights: MarginInsight[];
  generatedAt: string;
}

const TARGET_TOLERANCE = 0.01;

export function calcMarginRate(buyPrice: number, sellPrice: number): number | null {
  if (!buyPrice || !sellPrice || sellPrice <= 0) return null;
  return (sellPrice - buyPrice) / sellPrice;
}

export function buildMarginInsights(
  rows: MarginItemRow[],
  avgMargin: number | null,
  globalTarget: number,
): MarginInsight[] {
  const insights: MarginInsight[] = [];
  const top3 = [...rows].sort((a, b) => b.marginRate - a.marginRate).slice(0, 3);
  const bottom3 = [...rows].sort((a, b) => a.marginRate - b.marginRate).slice(0, 3);

  if (top3.length >= 2) {
    insights.push({
      type: 'top_focus',
      text: `고마진 TOP3(${top3.map(r => r.name).join(', ')}) 판매 집중 권장`,
    });
  }

  if (bottom3.length >= 1) {
    const names = bottom3.map(r => `${r.name}(${(r.marginRate * 100).toFixed(0)}%)`).join(', ');
    insights.push({
      type: 'bottom_review',
      text: `저마진 품목 ${names} — 가격 조정 또는 단종 검토`,
    });
  }

  if (avgMargin != null && avgMargin < globalTarget - TARGET_TOLERANCE) {
    insights.push({
      type: 'avg_below_target',
      text: `매장 평균 마진 ${(avgMargin * 100).toFixed(1)}% — 목표 ${(globalTarget * 100).toFixed(0)}% 미달`,
    });
  }

  return insights.slice(0, 3);
}

export function formatMarginPct(rate: number): string {
  return `${(rate * 100).toFixed(1)}%`;
}

export { TARGET_TOLERANCE };
