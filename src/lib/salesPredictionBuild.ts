/** AI 매출 예측 — 종합 의견·통계 fallback */

import type { PredictionItemStat } from '@/lib/dashboardSalesData';
import { itemNamesMatch } from '@/lib/itemNameMatch';
import { formatItemDailyAvgReason } from '@/lib/salesMetricRules';

export type ItemAgg = PredictionItemStat;

function findStat(name: string, stats: ItemAgg[]): ItemAgg | undefined {
  return stats.find(s => itemNamesMatch(s.name, name));
}

const PLACEHOLDER_PATTERNS = [
  /500자 이내.*준수/,
  /구조:\s*①/,
  /종합 분석\s*\(?500자/,
  /품목 예측\s*\*?\*?.*종합 분석/,
  /다음 JSON 형식/,
  /반드시 준수/,
  /감정·추상 표현 금지/,
  /볼드.*강조\s*$/,
];

export function isPlaceholderSupporterComment(text: string): boolean {
  const t = (text || '').trim();
  if (!t || t.length < 30) return true;
  return PLACEHOLDER_PATTERNS.some(re => re.test(t));
}

export function buildStatisticalSupporterComment(opts: {
  today: string;
  dowLabel: string;
  contextInfo: string;
  scheduleNotes?: string;
  sortedItems: ItemAgg[];
  weatherLine: string;
  salesReportDays: number;
}): string {
  const { today, dowLabel, contextInfo, scheduleNotes, sortedItems, weatherLine, salesReportDays } = opts;
  const totalAmt = sortedItems.reduce((s, d) => s + d.amount, 0) || 1;
  const top3 = sortedItems.slice(0, 3).map(d => {
    const share = Math.round((d.amount / totalAmt) * 100);
    return `**${d.name}** ${d.dailyAvgSales.toLocaleString()}원(비중 ${share}%)`;
  }).join(', ');
  const bottom1 = sortedItems.length >= 5 ? sortedItems[sortedItems.length - 1].name : '';

  const parts = [
    `**${today}(${dowLabel})** 90일 POS 판매 ${salesReportDays}일치·상위 ${sortedItems.length}품목 **매출금액** 기준 예측입니다.`,
    contextInfo,
    scheduleNotes || '',
    weatherLine,
    `90일 추정 매출 합계 ${totalAmt.toLocaleString()}원.`,
    `주력 예상 품목: ${top3}.`,
    bottom1 ? `감소 주의: **${bottom1}** 등 하위 품목은 진열·발주 축소 검토.` : '',
    '오늘은 상위 품목 재고·진열을 우선 확보하고, 날씨·요일 변수에 맞춰 프로모션을 조정하세요.',
  ];
  return parts.filter(Boolean).join(' ').slice(0, 500);
}

function statReason(d: ItemAgg, tier: 'top' | 'bottom', dowLabel: string, weatherSnippet: string, totalAmount: number) {
  const share = Math.round((d.amount / totalAmount) * 100);
  return [
    formatItemDailyAvgReason(d.amount, d.salesDays, d.dailyAvgSales, share),
    tier === 'top' ? `[판단] ${dowLabel}·${weatherSnippet} 상위권` : '[판단] 하위·감소 추세',
  ].join('\n').slice(0, 480);
}

export function buildStatisticalItemRows(
  sortedItems: ItemAgg[],
  opts: { totalAmount: number; dowLabel: string; weatherSnippet: string },
) {
  const { totalAmount, dowLabel, weatherSnippet } = opts;

  const topItems = sortedItems.slice(0, 5).map((d, i) => ({
    rank: i + 1,
    item: d.name,
    expectedSales: d.dailyAvgSales,
    dailyAvgSales: d.dailyAvgSales,
    salesDays: d.salesDays,
    salesUnit: '원' as const,
    displayRecommend: '기본 진열 유지',
    changeVsLastWeek: d.changeVsLastWeek,
    confidence: 60,
    badges: [] as string[],
    reasons: ['90일 일평균매출', dowLabel],
    reasonDetail: statReason(d, 'top', dowLabel, weatherSnippet, totalAmount),
  }));

  const bottomItems = sortedItems.slice(-5).reverse().map((d, i) => ({
    rank: i + 1,
    item: d.name,
    expectedSales: d.dailyAvgSales,
    dailyAvgSales: d.dailyAvgSales,
    salesDays: d.salesDays,
    salesUnit: '원' as const,
    displayRecommend: '재고 최소화',
    changeVsLastWeek: d.changeVsLastWeek,
    confidence: 55,
    badges: ['📉DOWN'],
    reasons: ['매출 하위', '비중 낮음'],
    reasonDetail: statReason(d, 'bottom', dowLabel, weatherSnippet, totalAmount),
  }));

  return { topItems, bottomItems };
}

/** AI 품목 — 통계 일평균매출(매출÷판매일수)로 보정 */
export function alignPredictionItemsWithStats(
  items: Array<Record<string, unknown>>,
  statsByName: Map<string, ItemAgg>,
  opts: { totalAmount: number; dowLabel: string; weatherSnippet: string; tier: 'top' | 'bottom' },
): Array<Record<string, unknown>> {
  const { totalAmount, dowLabel, weatherSnippet, tier } = opts;
  const statsList = [...statsByName.values()];
  return items.map(raw => {
    const itemName = String(raw.item || '').trim();
    const stat = statsByName.get(itemName) || findStat(itemName, statsList);
    if (!stat) return raw;
    const aiDetail = String(raw.reasonDetail || '').trim();
    const detail = aiDetail.includes('일평균매출') || (aiDetail.includes('÷') && aiDetail.includes('일'))
      ? aiDetail
      : statReason(stat, tier, dowLabel, weatherSnippet, totalAmount);
    return {
      ...raw,
      item: itemName,
      expectedSales: stat.dailyAvgSales,
      dailyAvgSales: stat.dailyAvgSales,
      salesDays: stat.salesDays,
      salesUnit: '원',
      changeVsLastWeek: stat.changeVsLastWeek,
      reasonDetail: detail.slice(0, 480),
    };
  });
}
