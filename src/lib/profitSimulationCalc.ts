export interface SimulationBaseline {
  baseMonthlyRevenue: number;
  baseCostRatio: number;
  fixedCostsTotal: number;
  businessDaysPerMonth: number;
  ytdRevenue: number;
  yearRemainingMonths: number;
  monthLabel: string;
}

export interface SimulationInputs {
  revenueGrowthPct: number;
  costRatioDeltaPct: number;
  fixedCostDeltaPct: number;
}

export interface SimulationResult {
  monthlyRevenue: number;
  operatingProfit: number;
  monthlyBep: number;
  bepDayOfMonth: number | null;
  yearEndRevenue: number;
  adjustedCostRatio: number;
  grossProfit: number;
}

export type ScenarioKey = 'optimistic' | 'base' | 'pessimistic';

export const PRESET_SCENARIOS: Record<ScenarioKey, SimulationInputs & { label: string }> = {
  optimistic: {
    label: '낙관',
    revenueGrowthPct: 15,
    costRatioDeltaPct: -5,
    fixedCostDeltaPct: 0,
  },
  base: {
    label: '기본',
    revenueGrowthPct: 0,
    costRatioDeltaPct: 0,
    fixedCostDeltaPct: 0,
  },
  pessimistic: {
    label: '비관',
    revenueGrowthPct: -5,
    costRatioDeltaPct: 5,
    fixedCostDeltaPct: 0,
  },
};

export function runProfitSimulation(
  baseline: SimulationBaseline,
  inputs: SimulationInputs,
): SimulationResult {
  const growth = inputs.revenueGrowthPct / 100;
  const costDelta = inputs.costRatioDeltaPct / 100;
  const fixedDelta = inputs.fixedCostDeltaPct / 100;

  const adjustedCostRatio = Math.min(0.95, Math.max(0.05, baseline.baseCostRatio + costDelta));
  const monthlyRevenue = Math.round(baseline.baseMonthlyRevenue * (1 + growth));
  const variableCost = monthlyRevenue * adjustedCostRatio;
  const fixedCosts = baseline.fixedCostsTotal * (1 + fixedDelta);
  const grossProfit = monthlyRevenue - variableCost;
  const operatingProfit = Math.round(grossProfit - fixedCosts);

  const marginRate = 1 - adjustedCostRatio;
  const monthlyBep = marginRate > 0.01
    ? Math.round(fixedCosts / marginRate)
    : 0;

  const dailyRevenue = baseline.businessDaysPerMonth > 0
    ? monthlyRevenue / baseline.businessDaysPerMonth
    : 0;
  const bepDayOfMonth = dailyRevenue > 0 && monthlyBep > 0
    ? Math.min(baseline.businessDaysPerMonth, Math.ceil(monthlyBep / dailyRevenue))
    : null;

  const yearEndRevenue = Math.round(
    baseline.ytdRevenue + monthlyRevenue * baseline.yearRemainingMonths,
  );

  return {
    monthlyRevenue,
    operatingProfit,
    monthlyBep,
    bepDayOfMonth,
    yearEndRevenue,
    adjustedCostRatio,
    grossProfit: Math.round(grossProfit),
  };
}

export function formatManwon(amount: number): string {
  if (Math.abs(amount) >= 10000) {
    return `${(amount / 10000).toFixed(0)}만원`;
  }
  return `${amount.toLocaleString('ko-KR')}원`;
}

export function formatManwonDetailed(amount: number): string {
  return `${Math.round(amount).toLocaleString('ko-KR')}원`;
}
