export interface BreakEvenStatus {
  date: string;
  fixedCostsTotal: number;
  variableCostRatio: number;
  marginRate: number;
  monthlyBep: number;
  businessDays: number;
  todayBepTarget: number;
  todayNetSales: number;
  progressPct: number;
  remainingAmount: number;
  achieved: boolean;
  monthKey: string;
}

export function calcMonthlyBep(fixedCostsTotal: number, variableCostRatio: number): number {
  const margin = 1 - variableCostRatio;
  if (margin <= 0.01 || fixedCostsTotal <= 0) return 0;
  return Math.round(fixedCostsTotal / margin);
}

export function calcTodayBepTarget(monthlyBep: number, businessDays: number): number {
  if (monthlyBep <= 0) return 0;
  const days = Math.max(1, businessDays);
  return Math.round(monthlyBep / days);
}

export function calcBreakEvenProgress(todayNetSales: number, todayBepTarget: number): {
  progressPct: number;
  remainingAmount: number;
  achieved: boolean;
} {
  if (todayBepTarget <= 0) {
    return { progressPct: 0, remainingAmount: 0, achieved: false };
  }
  const progressPct = Math.min(100, Math.round((todayNetSales / todayBepTarget) * 1000) / 10);
  const remainingAmount = Math.max(0, Math.round(todayBepTarget - todayNetSales));
  return {
    progressPct,
    remainingAmount,
    achieved: todayNetSales >= todayBepTarget,
  };
}

export function buildBreakEvenStatus(input: {
  date: string;
  fixedCostsTotal: number;
  variableCostRatio: number;
  businessDays: number;
  todayNetSales: number;
  monthKey: string;
}): BreakEvenStatus {
  const variableCostRatio = Math.min(0.95, Math.max(0.05, input.variableCostRatio));
  const monthlyBep = calcMonthlyBep(input.fixedCostsTotal, variableCostRatio);
  const todayBepTarget = calcTodayBepTarget(monthlyBep, input.businessDays);
  const { progressPct, remainingAmount, achieved } = calcBreakEvenProgress(
    input.todayNetSales,
    todayBepTarget,
  );

  return {
    date: input.date,
    fixedCostsTotal: input.fixedCostsTotal,
    variableCostRatio,
    marginRate: 1 - variableCostRatio,
    monthlyBep,
    businessDays: input.businessDays,
    todayBepTarget,
    todayNetSales: input.todayNetSales,
    progressPct,
    remainingAmount,
    achieved,
    monthKey: input.monthKey,
  };
}

export function formatManwonShort(amount: number): string {
  if (amount >= 10000) return `${Math.round(amount / 10000)}만원`;
  return `${amount.toLocaleString('ko-KR')}원`;
}
