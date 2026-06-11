import { adminDb } from '@/lib/firebase/admin';

export type AnomalyType = 'spike' | 'drop';

export interface AnomalyResult {
  detected: boolean;
  type?: AnomalyType;
  date: string;
  todaySales: number;
  mean: number;
  stdDev: number;
  deviation: number;
  message?: string;
}

const MIN_HISTORY = 7;
const MIN_SALES = 50_000;
const SIGMA = 2;

export async function loadDailyNetSales(storeId: string, days = 35): Promise<{ date: string; netSales: number }[]> {
  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .orderBy('reportDate', 'desc')
    .limit(Math.max(days, 60))
    .get();

  return snap.docs
    .map(d => {
      const data = d.data();
      const net = Number(data.netSales ?? data.netSale ?? data.totalSales ?? 0);
      return { date: String(data.reportDate || ''), netSales: net };
    })
    .filter(r => r.date)
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(-days);
}

export function detectSalesAnomaly(
  history: { date: string; netSales: number }[],
  targetDate: string,
): AnomalyResult {
  const today = history.find(h => h.date === targetDate);
  const past = history.filter(h => h.date < targetDate).slice(-30);

  if (!today) {
    return { detected: false, date: targetDate, todaySales: 0, mean: 0, stdDev: 0, deviation: 0 };
  }

  if (past.length < MIN_HISTORY || today.netSales < MIN_SALES) {
    return {
      detected: false,
      date: targetDate,
      todaySales: today.netSales,
      mean: 0,
      stdDev: 0,
      deviation: 0,
      message: '분석 데이터 부족',
    };
  }

  const values = past.map(p => p.netSales);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length;
  const stdDev = Math.sqrt(variance) || 1;
  const deviation = (today.netSales - mean) / stdDev;

  if (deviation >= SIGMA) {
    return { detected: true, type: 'spike', date: targetDate, todaySales: today.netSales, mean, stdDev, deviation };
  }
  if (deviation <= -SIGMA) {
    return { detected: true, type: 'drop', date: targetDate, todaySales: today.netSales, mean, stdDev, deviation };
  }

  return { detected: false, date: targetDate, todaySales: today.netSales, mean, stdDev, deviation };
}

export async function runSalesAnomalyForStore(storeId: string, date: string) {
  const history = await loadDailyNetSales(storeId, 40);
  const result = detectSalesAnomaly(history, date);
  if (!result.detected) return { storeId, ...result, saved: false };

  const aiSummary = result.type === 'spike'
    ? `매출 급증: ${result.todaySales.toLocaleString()}원 (평균 ${Math.round(result.mean).toLocaleString()}원 대비 +${result.deviation.toFixed(1)}σ)`
    : `매출 급감: ${result.todaySales.toLocaleString()}원 (평균 ${Math.round(result.mean).toLocaleString()}원 대비 ${result.deviation.toFixed(1)}σ)`;

  const docId = `${storeId}_${date}`;
  await adminDb.collection('anomaly_logs').doc(docId).set({
    storeId,
    date,
    type: result.type,
    todaySales: result.todaySales,
    mean: result.mean,
    stdDev: result.stdDev,
    deviation: result.deviation,
    aiSummary,
    createdAt: new Date(),
  }, { merge: true });

  return { storeId, ...result, aiSummary, saved: true };
}
