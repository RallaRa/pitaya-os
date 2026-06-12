import { adminDb } from '@/lib/firebase/admin';
import { loadCostRatioDetail } from '@/lib/costRatio';
import {
  addDaysYMD,
  getKSTParts,
  getKSTTodayYMD,
} from '@/lib/dateUtils';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';
import { parseFixedCosts, sumFixedCosts } from '@/lib/fixedCosts';
import {
  PRESET_SCENARIOS,
  runProfitSimulation,
  type ScenarioKey,
  type SimulationBaseline,
  type SimulationInputs,
  type SimulationResult,
} from '@/lib/profitSimulationCalc';

export interface ProfitSimulationPayload {
  storeId: string;
  baseline: SimulationBaseline;
  fixedCosts: ReturnType<typeof parseFixedCosts>;
  scenarios: Record<ScenarioKey, SimulationResult & { inputs: SimulationInputs; label: string }>;
  generatedAt: string;
}

async function loadFixedCosts(storeId: string) {
  const doc = await adminDb.collection('store_settings').doc(storeId).get();
  return parseFixedCosts(doc.data()?.fixed_costs);
}

function daysInMonth(year: number, month: number): number {
  return new Date(year, month, 0).getDate();
}

export async function buildProfitSimulationBaseline(
  storeId: string,
): Promise<Omit<ProfitSimulationPayload, 'scenarios'>> {
  const today = getKSTTodayYMD();
  const { year, month, day } = getKSTParts();
  const monthStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const last30Start = addDaysYMD(today, -29);

  const [monthTotals, last30Totals, costDetail, fixedCosts] = await Promise.all([
    fetchPeriodTotals(storeId, monthStart, today, 'thisMonth'),
    fetchPeriodTotals(storeId, last30Start, today, 'last30'),
    loadCostRatioDetail(storeId).catch(() => null),
    loadFixedCosts(storeId),
  ]);

  const monthNet = monthTotals.net || 0;
  const daysInMonthCount = daysInMonth(year, month);
  const daysElapsed = day;

  const avgDailyFrom30 = last30Totals.net > 0 ? last30Totals.net / 30 : 0;
  const businessDaysPerMonth = 26;
  const baseMonthlyRevenue = avgDailyFrom30 > 0
    ? Math.round(avgDailyFrom30 * businessDaysPerMonth)
    : Math.round((monthNet / Math.max(1, daysElapsed)) * daysInMonthCount);

  const baseCostRatio = costDetail?.storeAvgRatio ?? 0.65;
  const fixedCostsTotal = sumFixedCosts(fixedCosts);

  const yearStart = `${year}-01-01`;
  const ytdTotals = await fetchPeriodTotals(storeId, yearStart, today, 'ytd');
  const yearRemainingMonths = Math.max(0, 12 - month);

  return {
    storeId,
    baseline: {
      baseMonthlyRevenue,
      baseCostRatio,
      fixedCostsTotal,
      businessDaysPerMonth,
      ytdRevenue: ytdTotals.net || 0,
      yearRemainingMonths,
      monthLabel: `${year}년 ${month}월`,
    },
    fixedCosts,
    generatedAt: new Date().toISOString(),
  };
}

export async function computeProfitSimulation(
  storeId: string,
  customInputs?: SimulationInputs,
): Promise<ProfitSimulationPayload> {
  const base = await buildProfitSimulationBaseline(storeId);

  const scenarios = {} as ProfitSimulationPayload['scenarios'];
  for (const key of Object.keys(PRESET_SCENARIOS) as ScenarioKey[]) {
    const preset = PRESET_SCENARIOS[key];
    const inputs = key === 'base' && customInputs ? customInputs : preset;
    scenarios[key] = {
      ...runProfitSimulation(base.baseline, inputs),
      inputs,
      label: preset.label,
    };
  }

  if (customInputs) {
    scenarios.base = {
      ...runProfitSimulation(base.baseline, customInputs),
      inputs: customInputs,
      label: '사용자',
    };
  }

  return { ...base, scenarios };
}
