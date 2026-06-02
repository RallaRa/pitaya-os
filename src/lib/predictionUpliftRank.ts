/**
 * 오늘 주목 품목 — 평소 대비 상승 + 날씨·공휴일·기념일·이벤트 반영
 */

import { addDaysYMD } from '@/lib/dateUtils';
import { itemNamesMatch } from '@/lib/itemNameMatch';
import type { PredictionItemStat } from '@/lib/dashboardSalesData';
import type { PredictionScheduleContext } from '@/lib/predictionCalendarContext';
import type { PredictionCalibration } from '@/lib/predictionAnalysis';

export const SPOTLIGHT_TOP_N = 10;
export const BASE_TOP_N = 10;
export const MIN_UPLIFT_SALES_DAYS = 5;
export const MIN_UPLIFT_SIGNAL_WON = 30_000;
export const MIN_UPLIFT_PCT = 8;

export interface WeatherImpactVariable {
  id?: string;
  name: string;
  active?: boolean;
  category?: string;
  condition: {
    metric: string;
    operator: string;
    value: number | number[] | boolean;
  };
  itemEffects?: Record<string, number>;
  description?: string;
}

export interface PredictionRankContext {
  todayYmd: string;
  weather: {
    tempMax: number;
    tempMin: number;
    precipProb: number;
    precipMm?: number;
    condition?: string;
  } | null;
  schedule: PredictionScheduleContext | null;
  activeVariables: WeatherImpactVariable[];
}

export interface ItemUpliftMetrics {
  baseline: number;
  todaySignal: number;
  upliftPct: number;
  contextBoost: number;
  upliftScore: number;
  activeContexts: string[];
}

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function evalOp(
  actual: number,
  operator: string,
  expected: number | number[] | boolean,
): boolean {
  if (operator === '==') return actual === expected;
  if (operator === '>=') return actual >= Number(expected);
  if (operator === '<=') return actual <= Number(expected);
  if (operator === 'between' && Array.isArray(expected)) {
    return actual >= expected[0] && actual <= expected[1];
  }
  if (operator === 'in' && Array.isArray(expected)) {
    return (expected as number[]).includes(actual);
  }
  return false;
}

/** 활성 날씨·일정 변수 판정 */
export function evaluateActiveContextVariables(
  ctx: PredictionRankContext,
): { active: WeatherImpactVariable[]; labels: string[] } {
  const { todayYmd, weather, schedule, activeVariables } = ctx;
  const d = parseYmd(todayYmd);
  const dow = d.getDay();
  const dayOfMonth = d.getDate();
  const tomorrow = addDaysYMD(todayYmd, 1);
  const tomorrowHoliday = schedule?.tomorrowHoliday?.isHoliday ?? false;
  const todayHoliday = schedule?.todayHoliday?.isHoliday ?? false;
  const todayLabel = schedule?.todayHoliday?.label || null;
  const tomorrowLabel = schedule?.tomorrowHoliday?.label || null;

  const active: WeatherImpactVariable[] = [];
  const labels: string[] = [];

  for (const v of activeVariables) {
    if (v.active === false) continue;
    const { metric, operator, value } = v.condition;
    let hit = false;

    switch (metric) {
      case 'tempMax':
        hit = weather != null && evalOp(weather.tempMax, operator, value);
        break;
      case 'tempMin':
        hit = weather != null && evalOp(weather.tempMin, operator, value);
        break;
      case 'precipProb':
        hit = weather != null && evalOp(weather.precipProb, operator, value);
        break;
      case 'precipMm':
        hit = weather != null && weather.precipMm != null && evalOp(weather.precipMm, operator, value);
        break;
      case 'dayOfWeek':
        hit = evalOp(dow, operator, value);
        break;
      case 'dayOfMonth':
        hit = evalOp(dayOfMonth, operator, value);
        break;
      case 'holidayEve':
        hit = operator === '==' && value === true && tomorrowHoliday;
        break;
      case 'isHoliday':
        hit = operator === '==' && value === true && todayHoliday;
        break;
      case 'weekend':
        hit = dow === 0 || dow === 6;
        break;
      default:
        break;
    }

    if (hit) {
      active.push(v);
      labels.push(v.name);
    }
  }

  if (todayLabel && !labels.some(l => l.includes(todayLabel))) {
    labels.push(`오늘·${todayLabel}`);
  }
  if (tomorrowLabel && !labels.some(l => l.includes(tomorrowLabel))) {
    labels.push(`내일·${tomorrowLabel}`);
  }
  if (weather?.condition && !labels.length) {
    labels.push(`날씨·${weather.condition}`);
  }

  return { active, labels: labels.slice(0, 8) };
}

/** 기념일·공휴일명 → 품목 키워드 가중 (변수 itemEffects 없을 때 보조) */
function holidayKeywordBoost(itemName: string, labels: string[]): number {
  let boost = 0;
  const text = labels.join(' ');
  const rules: { keys: string[]; patterns: string[]; pct: number }[] = [
    { keys: ['설', '추석', '명절', '연휴', '제철'], patterns: ['삼겹', '목살', '갈비', '오겹', '양지', '등심', 'LA'], pct: 12 },
    { keys: ['육회', '회', '샤브', '불고기'], patterns: ['육회', '회', '샤브', '불고기', '우삼겹'], pct: 15 },
    { keys: ['비', '우', '장마'], patterns: ['국거리', '앞다리', '사태', '잡뼈', '무거리', '스지'], pct: 10 },
    { keys: ['폭염', '고온', '30'], patterns: ['육회', '냉장', '샤브'], pct: 8 },
    { keys: ['한파', '추위', '5'], patterns: ['국거리', '전골', '찌개', '사태', '잡뼈'], pct: 10 },
    { keys: ['부처님', '칠석'], patterns: ['채소', '두부'], pct: -8 },
    { keys: ['급여', '22'], patterns: ['삼겹', '목살', '등심', '한우'], pct: 6 },
    { keys: ['주말', '토', '일'], patterns: ['삼겹', '목살', '육회', '갈비'], pct: 5 },
  ];

  for (const r of rules) {
    if (!r.keys.some(k => text.includes(k))) continue;
    if (r.patterns.some(p => itemName.includes(p))) boost += r.pct;
  }
  return boost;
}

function mergeItemContextBoost(
  itemName: string,
  activeVars: WeatherImpactVariable[],
  schedule: PredictionScheduleContext | null,
  contextLabels: string[],
): number {
  let boost = 0;

  for (const v of activeVars) {
    const effects = v.itemEffects || {};
    for (const [key, pct] of Object.entries(effects)) {
      if (itemNamesMatch(key, itemName)) boost += Number(pct) || 0;
    }
  }

  const labels: string[] = [...contextLabels];
  if (schedule?.todayHoliday.label) labels.push(schedule.todayHoliday.label);
  if (schedule?.tomorrowHoliday.label) labels.push(`내일 ${schedule.tomorrowHoliday.label}`);

  boost += holidayKeywordBoost(itemName, labels);
  return Math.max(-35, Math.min(35, boost));
}

export function computeTodaySignal(benchmarks: Record<string, number>): number {
  const y = benchmarks.yesterday || 0;
  const w = benchmarks.lastWeekDow || 0;
  const m = benchmarks.lastMonthDow || 0;
  return Math.round(y * 0.5 + w * 0.3 + m * 0.2);
}

export function computeItemUpliftMetrics(
  stat: PredictionItemStat,
  benchmarks: Record<string, number>,
  rankCtx: PredictionRankContext,
  activeVars: WeatherImpactVariable[],
  contextLabels: string[],
): ItemUpliftMetrics {
  const baseline = Math.max(stat.dailyAvgSales, 1);
  const todaySignal = computeTodaySignal(benchmarks);
  const upliftPct = Math.round(((todaySignal - baseline) / baseline) * 100);
  const contextBoost = mergeItemContextBoost(
    stat.name,
    activeVars,
    rankCtx.schedule,
    contextLabels,
  );
  const trend = stat.changeVsLastWeek ?? 0;
  const upliftScore = Math.round(
    upliftPct * 0.45
    + trend * 0.25
    + contextBoost * 0.2
    + Math.min(15, Math.max(-15, (benchmarks.yesterday || 0) > baseline ? 8 : 0)),
  );

  const activeContexts: string[] = [];
  if (contextBoost >= 8) activeContexts.push(`이슈+${contextBoost}%`);
  if (upliftPct >= MIN_UPLIFT_PCT) activeContexts.push(`평소대비+${upliftPct}%`);
  if (trend >= 15) activeContexts.push(`전주+${trend}%`);

  return {
    baseline,
    todaySignal,
    upliftPct,
    contextBoost,
    upliftScore,
    activeContexts,
  };
}

export function qualifiesForSpotlight(
  stat: PredictionItemStat,
  metrics: ItemUpliftMetrics,
  benchmarks: Record<string, number>,
): boolean {
  if (stat.salesDays < MIN_UPLIFT_SALES_DAYS) return false;
  const signal = Math.max(benchmarks.yesterday || 0, benchmarks.lastWeekDow || 0);
  if (signal < MIN_UPLIFT_SIGNAL_WON && metrics.contextBoost < 12) return false;
  return (
    metrics.upliftPct >= MIN_UPLIFT_PCT
    || metrics.contextBoost >= 12
    || metrics.upliftScore >= 18
  );
}

export interface RankedItemSets {
  spotlightTopNames: string[];
  baseTopNames: string[];
  bottomNames: string[];
  contextLabels: string[];
  metricsByName: Map<string, ItemUpliftMetrics>;
}

export function rankItemsWithUpliftAndContext(
  sortedItems: PredictionItemStat[],
  itemBenchmarks: Map<string, { benchmarks: Record<string, number>; todayScore: number }>,
  rankCtx: PredictionRankContext,
  calibration?: PredictionCalibration | null,
): RankedItemSets {
  const { active: activeVars, labels: contextLabels } = evaluateActiveContextVariables(rankCtx);
  const metricsByName = new Map<string, ItemUpliftMetrics>();

  const scored = sortedItems.map(stat => {
    const bench = itemBenchmarks.get(stat.name);
    const benchmarks = bench?.benchmarks || {};
    let metrics = computeItemUpliftMetrics(stat, benchmarks, rankCtx, activeVars, contextLabels);

    if (calibration) {
      if (calibration.frequentlyMissed.some(r => itemNamesMatch(r, stat.name))) {
        metrics = { ...metrics, upliftScore: metrics.upliftScore + 12, activeContexts: [...metrics.activeContexts, '예측분석↑'] };
      }
      if (calibration.frequentlyOverpredicted.some(r => itemNamesMatch(r, stat.name))) {
        metrics = { ...metrics, upliftScore: metrics.upliftScore - 10 };
      }
    }

    metricsByName.set(stat.name, metrics);
    return {
      name: stat.name,
      todayScore: bench?.todayScore ?? stat.dailyAvgSales,
      metrics,
      benchmarks,
      qualifies: qualifiesForSpotlight(stat, metrics, benchmarks),
    };
  });

  const spotlightPool = scored.filter(s => s.qualifies);
  const spotlightSorted = [...(spotlightPool.length >= 3 ? spotlightPool : scored)]
    .sort((a, b) => b.metrics.upliftScore - a.metrics.upliftScore);

  const spotlightTopNames = spotlightSorted
    .slice(0, SPOTLIGHT_TOP_N)
    .map(s => s.name);

  const spotlightSet = new Set(spotlightTopNames);
  const baseTopNames = [...scored]
    .sort((a, b) => b.todayScore - a.todayScore)
    .filter(s => !spotlightSet.has(s.name))
    .slice(0, BASE_TOP_N)
    .map(s => s.name);

  const bottomNames = [...scored]
    .filter(s => !spotlightSet.has(s.name))
    .sort((a, b) => a.metrics.upliftScore - b.metrics.upliftScore || a.metrics.upliftPct - b.metrics.upliftPct)
    .slice(0, SPOTLIGHT_TOP_N)
    .map(s => s.name);

  return {
    spotlightTopNames,
    baseTopNames,
    bottomNames,
    contextLabels,
    metricsByName,
  };
}

export function formatUpliftReasonDetail(
  stat: PredictionItemStat,
  metrics: ItemUpliftMetrics,
  contextLabels: string[],
): string {
  const ctx = contextLabels.length ? contextLabels.join(', ') : '일반';
  return [
    `[오늘 주목] 평소 일평균 ${metrics.baseline.toLocaleString()}원`,
    `오늘신호 ${metrics.todaySignal.toLocaleString()}원 → 평소대비 ${metrics.upliftPct >= 0 ? '+' : ''}${metrics.upliftPct}%`,
    metrics.contextBoost !== 0 ? `날씨·공휴일·기념일 반영 ${metrics.contextBoost >= 0 ? '+' : ''}${metrics.contextBoost}%` : '',
    `적용 이슈: ${ctx}`,
    metrics.activeContexts.length ? metrics.activeContexts.join(' · ') : '',
    `전주대비 ${stat.changeVsLastWeek >= 0 ? '+' : ''}${stat.changeVsLastWeek}%`,
  ].filter(Boolean).join(' · ');
}
