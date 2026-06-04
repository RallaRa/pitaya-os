/** pos_daily_sales / daily_reports 문서에서 화면 표시용 매출 추출 */

export interface SalesDocData {
  isClosed?: boolean;
  headers?: Array<{ totalSale?: number; totalSales?: number }>;
  finish?: { totalSale?: number; netSale?: number; returnSale?: number };
  totalSales?: number;
  netSales?: number;
  netSale?: number;
  returnAmount?: number;
}

export function getDisplayTotalSale(data: SalesDocData | null | undefined): number {
  if (!data) return 0;
  if (data.isClosed && data.finish?.totalSale) return Number(data.finish.totalSale) || 0;
  const headers = data.headers || [];
  if (headers.length > 0) {
    const sum = headers.reduce(
      (s, h) => s + Number(h.totalSale ?? h.totalSales ?? 0),
      0,
    );
    if (sum > 0) return sum;
  }
  if (data.finish?.totalSale) return Number(data.finish.totalSale) || 0;
  return Number(data.totalSales ?? 0) || 0;
}

export function getDisplayNetSales(data: SalesDocData | null | undefined): number {
  if (!data) return 0;
  if (data.isClosed && data.finish?.netSale) return Number(data.finish.netSale) || 0;
  const net = data.netSales ?? data.netSale;
  if (net != null && net !== 0) return Number(net) || 0;
  return getDisplayTotalSale(data);
}

/** 반품금액 (마감 finish.returnSale / returnAmount, 없으면 총매출−순매출) */
export function getDisplayReturnAmount(data: SalesDocData | null | undefined): number {
  if (!data) return 0;
  const explicit = data.returnAmount ?? data.finish?.returnSale;
  if (explicit != null && Number(explicit) > 0) return Number(explicit) || 0;
  const total = getDisplayTotalSale(data);
  const net = getDisplayNetSales(data);
  if (total > net) return total - net;
  return 0;
}

export function posDailySalesDocId(storeId: string, date: string) {
  return `${storeId}_${date}`;
}
