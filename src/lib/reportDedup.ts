/** daily_reports 중복 날짜 선택 — pos_bridge 0원 스냅샷보다 수동/양수 POS 우선 */

export const isLivePOS = (src?: string) => src === 'pos_bridge';

export function reportDocScore(dr: { source?: string; totalSales?: number }): number {
  const s = dr.totalSales || 0;
  if (isLivePOS(dr.source) && s > 0) return Infinity;
  if (isLivePOS(dr.source) && s === 0) return -1;
  return s;
}

export function pickBestReportByDate<T extends { reportDate: string; source?: string; totalSales?: number }>(
  docs: T[],
  storeId: string,
): Map<string, T> {
  const byDate = new Map<string, T>();
  for (const dr of docs) {
    if ((dr as { storeId?: string }).storeId && (dr as { storeId?: string }).storeId !== storeId) continue;
    const existing = byDate.get(dr.reportDate);
    if (!existing || reportDocScore(dr) > reportDocScore(existing)) {
      byDate.set(dr.reportDate, dr);
    }
  }
  return byDate;
}
