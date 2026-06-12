export interface WeeklyCoachingBriefing {
  weekId: string;
  storeId: string;
  periodStart: string;
  periodEnd: string;
  summary: string;
  focusTasks: string[];
  inventoryAdvice: string[];
  marketingSuggestion: string;
  rawMetrics: Record<string, unknown>;
  messengerText: string;
  generatedAt: string;
  provider?: string;
}

export function formatWeeklyCoachingMessenger(b: WeeklyCoachingBriefing): string {
  const lines = [
    `🧭 AI 경영 코치 (${b.periodStart} ~ ${b.periodEnd})`,
    '',
    '📊 지난 주 총평',
    b.summary,
    '',
    '🎯 이번 주 집중 과제',
    ...b.focusTasks.map((t, i) => `${i + 1}. ${t}`),
  ];
  if (b.inventoryAdvice.length) {
    lines.push('', '📦 재고·발주', ...b.inventoryAdvice.map(a => `· ${a}`));
  }
  if (b.marketingSuggestion) {
    lines.push('', '💡 마케팅', b.marketingSuggestion);
  }
  return lines.join('\n');
}

export function buildWeekId(startYmd: string): string {
  return startYmd.slice(0, 7) + '-W' + startYmd.slice(8, 10);
}
