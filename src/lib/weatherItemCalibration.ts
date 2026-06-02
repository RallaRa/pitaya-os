/**
 * 품목별 일매출 × 날씨·공휴일 조건 비교 → weather_impact_variables.itemEffects 자동 산출
 */

import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { fetchDailyReportsSince } from '@/lib/dashboardSalesData';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { getWeatherCondition, getStoreCoords } from '@/lib/weather';
import {
  getHolidayInfoForDate,
  resolveHolidaySetForYmdList,
} from '@/lib/predictionCalendarContext';
import { DEFAULT_WEATHER_VARIABLES } from '@/lib/weatherImpactDefaults';
import type { WeatherImpactVariable } from '@/lib/predictionUpliftRank';

export interface DaySalesWeather {
  date: string;
  items: Record<string, number>;
  storeNet: number;
  weather: {
    tempMax: number;
    tempMin: number;
    precipMm: number;
    precipProb: number;
    weathercode: number;
    condition: string;
  };
  dow: number;
  dayOfMonth: number;
  isHoliday: boolean;
  isHolidayEve: boolean;
  holidayLabel: string | null;
}

const MIN_MATCH_DAYS = 4;
const MIN_OTHER_DAYS = 8;
const MIN_ITEM_AMOUNT = 5000;
const LOOKBACK_DAYS = 120;
const TOP_ITEMS_FOR_CALIBRATION = 28;
const STALE_DAYS = 7;

function parseYmd(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function eachDateYmd(start: string, end: string): string[] {
  const out: string[] = [];
  for (let d = parseYmd(start); d <= parseYmd(end); d.setDate(d.getDate() + 1)) {
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`);
  }
  return out;
}

function precipProbFromMm(mm: number, code: number): number {
  if (code >= 51 && code <= 67) return Math.min(95, 60 + mm * 5);
  if (mm >= 10) return 85;
  if (mm >= 5) return 70;
  if (mm >= 1) return 40;
  return 15;
}

/** Open-Meteo 일괄 조회 */
export async function fetchWeatherRange(
  startYmd: string,
  endYmd: string,
  coords: { lat: number; lng: number },
): Promise<Map<string, DaySalesWeather['weather']>> {
  const map = new Map<string, DaySalesWeather['weather']>();
  try {
    const url =
      `https://archive-api.open-meteo.com/v1/archive?latitude=${coords.lat}&longitude=${coords.lng}` +
      `&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weathercode` +
      `&timezone=Asia%2FSeoul&start_date=${startYmd}&end_date=${endYmd}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(20000) });
    if (!res.ok) return map;
    const json = await res.json();
    const dates: string[] = json.daily?.time || [];
    dates.forEach((date, i) => {
      const code = Number(json.daily?.weathercode?.[i] ?? 0);
      const precipMm = Number(json.daily?.precipitation_sum?.[i] ?? 0);
      map.set(date, {
        tempMax: Math.round(json.daily?.temperature_2m_max?.[i] ?? 20),
        tempMin: Math.round(json.daily?.temperature_2m_min?.[i] ?? 10),
        precipMm: Math.round(precipMm * 10) / 10,
        precipProb: precipProbFromMm(precipMm, code),
        weathercode: code,
        condition: getWeatherCondition(code),
      });
    });
  } catch { /* ignore */ }
  return map;
}

export async function loadDailySalesWeatherSeries(
  storeId: string,
  coords: { lat: number; lng: number },
  apiKey: string,
  lookbackDays = LOOKBACK_DAYS,
): Promise<DaySalesWeather[]> {
  const end = getKSTTodayYMD();
  const start = addDaysYMD(end, -(lookbackDays - 1));
  const dates = eachDateYmd(start, end);

  const [weatherMap, drSnap, holidaySet] = await Promise.all([
    fetchWeatherRange(start, end, coords),
    fetchDailyReportsSince(storeId, start),
    resolveHolidaySetForYmdList(apiKey, dates),
  ]);

  const byDate = new Map<string, DaySalesWeather>();

  if (drSnap && !drSnap.empty) {
    const reports = drSnap.docs.map(d => ({
      ...d.data(),
      reportDate: d.data().reportDate as string,
      storeId: d.data().storeId as string,
      items: d.data().items as Array<{ name?: string; qty?: number; netSales?: number; amount?: number }>,
    }));
    for (const d of pickBestReportByDate(reports, storeId).values()) {
      const date = d.reportDate || '';
      if (!date || date < start || date > end) continue;
      const items: Record<string, number> = {};
      let storeNet = 0;
      (d.items || []).forEach(it => {
        const name = String(it.name || '').trim();
        if (!name) return;
        const amt = Number(it.netSales ?? it.amount ?? 0);
        items[name] = (items[name] || 0) + amt;
        storeNet += amt;
      });
      const w = weatherMap.get(date) || {
        tempMax: 20, tempMin: 10, precipMm: 0, precipProb: 15, weathercode: 0, condition: '맑음',
      };
      const tomorrow = addDaysYMD(date, 1);
      const { isHoliday, label } = getHolidayInfoForDate(date, holidaySet);
      const tmrHoliday = getHolidayInfoForDate(tomorrow, holidaySet).isHoliday;
      const dObj = parseYmd(date);
      byDate.set(date, {
        date,
        items,
        storeNet,
        weather: w,
        dow: dObj.getDay(),
        dayOfMonth: dObj.getDate(),
        isHoliday,
        isHolidayEve: tmrHoliday,
        holidayLabel: label,
      });
    }
  }

  return [...byDate.values()].filter(d => d.storeNet > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function dayMatchesVariable(day: DaySalesWeather, v: WeatherImpactVariable): boolean {
  const { metric, operator, value } = v.condition;
  const w = day.weather;

  switch (metric) {
    case 'tempMax':
      return evalNum(w.tempMax, operator, value);
    case 'tempMin':
      return evalNum(w.tempMin, operator, value);
    case 'precipProb':
      return evalNum(w.precipProb, operator, value);
    case 'precipMm':
      return evalNum(w.precipMm, operator, value);
    case 'dayOfWeek':
      return evalNum(day.dow, operator, value);
    case 'dayOfMonth':
      return evalNum(day.dayOfMonth, operator, value);
    case 'holidayEve':
      return operator === '==' && value === true && day.isHolidayEve;
    case 'isHoliday':
      return operator === '==' && value === true && day.isHoliday;
    default:
      return false;
  }
}

function evalNum(actual: number, operator: string, expected: number | number[] | boolean): boolean {
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

function topItemNamesFromSeries(series: DaySalesWeather[], limit: number): string[] {
  const totals: Record<string, number> = {};
  series.forEach(d => {
    Object.entries(d.items).forEach(([name, amt]) => {
      totals[name] = (totals[name] || 0) + amt;
    });
  });
  return Object.entries(totals)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([n]) => n);
}

function computeItemEffectsForVariable(
  series: DaySalesWeather[],
  variable: WeatherImpactVariable,
  itemNames: string[],
): Record<string, number> {
  const match = series.filter(d => dayMatchesVariable(d, variable));
  const other = series.filter(d => !dayMatchesVariable(d, variable));
  if (match.length < MIN_MATCH_DAYS || other.length < MIN_OTHER_DAYS) {
    return {};
  }

  const effects: Record<string, number> = {};

  for (const name of itemNames) {
    const matchAmts: number[] = [];
    const otherAmts: number[] = [];

    match.forEach(d => {
      const amt = d.items[name];
      if (amt != null && amt >= MIN_ITEM_AMOUNT) matchAmts.push(amt);
    });
    other.forEach(d => {
      const amt = d.items[name];
      if (amt != null && amt >= MIN_ITEM_AMOUNT) otherAmts.push(amt);
    });

    if (matchAmts.length < 2 || otherAmts.length < 4) continue;

    const matchAvg = matchAmts.reduce((s, v) => s + v, 0) / matchAmts.length;
    const otherAvg = otherAmts.reduce((s, v) => s + v, 0) / otherAmts.length;
    const rawPct = Math.round(((matchAvg - otherAvg) / Math.max(otherAvg, 1)) * 100);
    const pct = Math.max(-40, Math.min(40, rawPct));
    if (Math.abs(pct) >= 5) effects[name] = pct;
  }

  return effects;
}

export interface CalibrationResult {
  variables: WeatherImpactVariable[];
  seriesDays: number;
  topItems: string[];
  calibratedAt: string;
  details: Array<{ id: string; name: string; matchDays: number; otherDays: number; itemCount: number }>;
}

export function calibrateWeatherVariablesFromSeries(
  series: DaySalesWeather[],
  baseVariables: WeatherImpactVariable[] = DEFAULT_WEATHER_VARIABLES as WeatherImpactVariable[],
): CalibrationResult {
  const topItems = topItemNamesFromSeries(series, TOP_ITEMS_FOR_CALIBRATION);
  const details: CalibrationResult['details'] = [];

  const variables = baseVariables.map(v => {
    const itemEffects = computeItemEffectsForVariable(series, v, topItems);
    const match = series.filter(d => dayMatchesVariable(d, v)).length;
    const other = series.length - match;
    details.push({
      id: v.id || v.name,
      name: v.name,
      matchDays: match,
      otherDays: other,
      itemCount: Object.keys(itemEffects).length,
    });
    return {
      ...v,
      itemEffects,
      sampleCount: match,
      dataSource: 'POS·Open-Meteo·공휴일 자동분석',
      calibratedAt: new Date().toISOString(),
      analysisNote: `조건일 ${match}일 vs 기타 ${other}일 · 품목 ${Object.keys(itemEffects).length}개`,
    };
  });

  return {
    variables,
    seriesDays: series.length,
    topItems,
    calibratedAt: new Date().toISOString(),
    details,
  };
}

export async function runWeatherItemCalibration(
  storeId: string,
  options: {
    regionSido?: string;
    apiKey?: string;
    lookbackDays?: number;
    force?: boolean;
  } = {},
): Promise<CalibrationResult & { skipped?: boolean; reason?: string }> {
  const apiKey = options.apiKey || process.env.PUBLIC_DATA_API_KEY || '';
  const coords = getStoreCoords(options.regionSido);

  const docRef = adminDb.collection('weather_impact_variables').doc(storeId);
  const existing = await docRef.get();
  const prevVars = (existing.exists ? existing.data()?.variables : null) as WeatherImpactVariable[] | null;
  const lastAt = existing.data()?.lastCalibratedAt as string | undefined;

  if (!options.force && lastAt) {
    const age = Date.now() - new Date(lastAt).getTime();
    if (age < STALE_DAYS * 86400000 && prevVars?.some(v => Object.keys(v.itemEffects || {}).length > 0)) {
      return {
        variables: prevVars || (DEFAULT_WEATHER_VARIABLES as WeatherImpactVariable[]),
        seriesDays: 0,
        topItems: [],
        calibratedAt: lastAt,
        details: [],
        skipped: true,
        reason: `${STALE_DAYS}일 이내 분석본 사용`,
      };
    }
  }

  const series = await loadDailySalesWeatherSeries(
    storeId,
    coords,
    apiKey,
    options.lookbackDays ?? LOOKBACK_DAYS,
  );

  if (series.length < 20) {
    return {
      variables: prevVars || (DEFAULT_WEATHER_VARIABLES as WeatherImpactVariable[]),
      seriesDays: series.length,
      topItems: [],
      calibratedAt: new Date().toISOString(),
      details: [],
      skipped: true,
      reason: `분석용 일수 부족 (${series.length}일, 최소 20일)`,
    };
  }

  const base = options.force
    ? (DEFAULT_WEATHER_VARIABLES as WeatherImpactVariable[])
    : prevVars?.length
      ? prevVars
      : (DEFAULT_WEATHER_VARIABLES as WeatherImpactVariable[]);
  const result = calibrateWeatherVariablesFromSeries(series, base);

  await docRef.set({
    storeId,
    variables: result.variables,
    lastCalibratedAt: result.calibratedAt,
    calibrationMeta: {
      seriesDays: result.seriesDays,
      topItems: result.topItems.slice(0, 15),
      details: result.details,
      coords,
    },
    updatedAt: FieldValue.serverTimestamp(),
  }, { merge: true });

  return result;
}

export async function ensureWeatherVariablesCalibrated(
  storeId: string,
  regionSido?: string,
): Promise<WeatherImpactVariable[]> {
  const res = await runWeatherItemCalibration(storeId, { regionSido, force: false });
  return res.variables;
}
