export type {
  MarginItemRow,
  MarginInsight,
  MarginRankingResult,
} from '@/lib/marginRankingShared';

export {
  calcMarginRate,
  buildMarginInsights,
  formatMarginPct,
} from '@/lib/marginRankingShared';

export { computeMarginRanking } from '@/lib/marginRanking.server';
