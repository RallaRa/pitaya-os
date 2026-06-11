import { adminDb } from '@/lib/firebase/admin';

export interface MonthlyReportData {
  storeId: string;
  month: string;
  totalSales: number;
  netSales: number;
  customerCount: number;
  dataDays: number;
  avgDailySales: number;
  avgTicket: number;
}

export async function buildMonthlyReport(storeId: string, year: number, month: number): Promise<MonthlyReportData> {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .get();

  const docs = snap.docs.filter(d => {
    const date = String(d.data().reportDate || '');
    return date >= start && date <= end;
  });

  let totalSales = 0;
  let netSales = 0;
  let customerCount = 0;
  let dataDays = 0;

  for (const doc of docs) {
    const d = doc.data();
    totalSales += Number(d.totalSales || 0);
    netSales += Number(d.netSales ?? d.netSale ?? d.totalSales ?? 0);
    customerCount += Number(d.customerCount || 0);
    dataDays++;
  }

  return {
    storeId,
    month: `${year}-${String(month).padStart(2, '0')}`,
    totalSales,
    netSales,
    customerCount,
    dataDays,
    avgDailySales: dataDays ? Math.round(netSales / dataDays) : 0,
    avgTicket: customerCount ? Math.round(netSales / customerCount) : 0,
  };
}
