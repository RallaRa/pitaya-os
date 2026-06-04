import { adminDb } from '@/lib/firebase/admin';
import {
  dailyReportDocId,
  getCompareDates,
  mapDailyReportDoc,
  netSalesFromDailyReport,
  topItems,
  type ReportSnapshot,
} from '@/lib/reportCompare';
import { posDailySalesDocId } from '@/lib/posDailySales';
import { getKSTTodayYMD } from '@/lib/dateUtils';

export const SALES_ALERT_START_HOUR = 11;
export const SALES_DROP_THRESHOLD = 0.1;
export const SALES_RISE_THRESHOLD = 0.1;
/** 기준 누적이 이보다 작으면 % 비교 제외 (데이터 미수집·부분 시간대) */
export const SALES_ALERT_MIN_BENCHMARK_TOTAL = 100_000;
/** 기준이 오늘의 15% 미만이면 제외 (50만 vs 5만 → 900% 같은 왜곡 방지) */
export const SALES_ALERT_MIN_BENCHMARK_RATIO = 0.15;
/** 상승·하락 최소 금액 차이 */
export const SALES_ALERT_MIN_ABS_DELTA = 50_000;
/** 알림 문구에 표시할 최대 % (초과 시 "200%+" ) */
export const SALES_ALERT_MAX_DISPLAY_PCT = 200;

export function isBenchmarkComparable(benchTotal: number, todayTotal: number): boolean {
  if (benchTotal < SALES_ALERT_MIN_BENCHMARK_TOTAL) return false;
  if (todayTotal > 0 && benchTotal < todayTotal * SALES_ALERT_MIN_BENCHMARK_RATIO) return false;
  return true;
}

export function formatAlertChangePct(pct: number, direction: 'up' | 'down'): string {
  const raw = Math.round(pct * 100);
  const capped = Math.min(Math.max(raw, 0), SALES_ALERT_MAX_DISPLAY_PCT);
  const suffix = raw > SALES_ALERT_MAX_DISPLAY_PCT ? '+' : '';
  const arrow = direction === 'up' ? '↑' : '↓';
  return `${capped}%${suffix}${arrow}`;
}

export function formatBenchmarkAlertLine(
  label: string,
  benchTotal: number,
  pct: number,
  direction: 'up' | 'down',
): string {
  return `${label} ${formatAlertChangePct(pct, direction)} (기준 ${benchTotal.toLocaleString()}원)`;
}

const BENCHMARKS: { key: keyof ReturnType<typeof getCompareDates>; label: string }[] = [
  { key: 'yesterday', label: '전일' },
  { key: 'lastWeekDow', label: '전주 동요일' },
  { key: 'lastMonthDow', label: '전달 동요일' },
  { key: 'lastYearMonthDow', label: '전년 동요일' },
];

export function getKSTHour(): number {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }).format(new Date()),
  );
}

export async function loadReportSnapshot(storeId: string, date: string): Promise<ReportSnapshot | null> {
  const reportSnap = await adminDb.collection('daily_reports').doc(dailyReportDocId(storeId, date)).get();
  if (reportSnap.exists) {
    return mapDailyReportDoc(reportSnap.data() as Record<string, unknown>);
  }

  const posSnap = await adminDb.collection('pos_daily_sales').doc(posDailySalesDocId(storeId, date)).get();
  if (posSnap.exists) {
    const d = posSnap.data()!;
    return {
      timeSlots: d.timeSlots as ReportSnapshot['timeSlots'],
      items: [],
      totalSales: d.totalSales as number | undefined,
      netSales: d.netSales as number | undefined,
    };
  }

  return null;
}

function parseHour(raw: string | number | undefined): number | null {
  if (raw == null || raw === '') return null;
  const h = parseInt(String(raw).replace(/:.*/, ''), 10);
  return Number.isNaN(h) ? null : h;
}

/** 시간대별 totalSale(총매출) → 순매출 환산 비율 (일별 net/total) */
function hourlyNetSalesRatio(snapshot: ReportSnapshot | null): number {
  if (!snapshot) return 1;
  const total = Number(snapshot.totalSales ?? 0);
  if (total <= 0) return 1;
  const net = Number(
    snapshot.netSales
    ?? netSalesFromDailyReport(snapshot as Record<string, unknown>)
    ?? 0,
  );
  if (net <= 0) return 1;
  return Math.min(1, net / total);
}

export function cumulativeSalesBetweenHours(
  snapshot: ReportSnapshot | null,
  fromHour: number,
  toHour: number,
): number {
  if (!snapshot) return 0;

  const netRatio = hourlyNetSalesRatio(snapshot);
  const slots = snapshot.timeSlots || [];
  if (slots.length > 0) {
    let total = 0;
    for (const s of slots) {
      const h = parseHour(s.hour);
      if (h == null) continue;
      if (h >= fromHour && h <= toHour) {
        total += Math.round(Number(s.totalSale || 0) * netRatio);
      }
    }
    if (total > 0) return total;
  }

  let total = 0;
  for (const it of snapshot.items || []) {
    const h = parseHour((it.time || '').split(':')[0]);
    if (h == null) continue;
    if (h >= fromHour && h <= toHour) {
      total += Number(it.netSales ?? it.amount ?? 0);
    }
  }
  return total;
}

export function filterItemsBetweenHours(
  items: ReportSnapshot['items'],
  fromHour: number,
  toHour: number,
) {
  return (items || []).filter(it => {
    const h = parseHour((it.time || '').split(':')[0]);
    return h != null && h >= fromHour && h <= toHour;
  });
}

export interface SalesDropBenchmark {
  label: string;
  date: string;
  amount: number;
  dropPct: number;
}

export interface SalesHourlyAlertResult {
  triggered: boolean;
  todayTotal: number;
  hour: number;
  drops: SalesDropBenchmark[];
  focusItems: string[];
  message: string;
}

export interface SalesRiseBenchmark {
  label: string;
  date: string;
  amount: number;
  risePct: number;
}

export interface SalesHourlyRiseAlertResult {
  triggered: boolean;
  todayTotal: number;
  hour: number;
  rises: SalesRiseBenchmark[];
  focusItems: string[];
  message: string;
}

export function recommendFocusItems(
  todayItems: ReportSnapshot['items'],
  benchmarkSnapshots: ReportSnapshot[],
  fromHour: number,
  toHour: number,
  limit = 5,
): string[] {
  const benchTotals = new Map<string, number>();
  let benchDays = 0;

  for (const snap of benchmarkSnapshots) {
    const filtered = filterItemsBetweenHours(snap?.items, fromHour, toHour);
    if (!filtered.length) continue;
    benchDays += 1;
    for (const it of topItems(filtered, 25)) {
      benchTotals.set(it.name, (benchTotals.get(it.name) || 0) + it.amount);
    }
  }

  if (benchDays === 0) {
    const todayTop = topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), limit);
    return todayTop.map(i => i.name);
  }

  const todayMap = new Map<string, number>();
  for (const it of topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), 25)) {
    todayMap.set(it.name, it.amount);
  }

  const ranked = [...benchTotals.entries()]
    .map(([name, benchSum]) => {
      const avgBench = benchSum / benchDays;
      const todayAmt = todayMap.get(name) || 0;
      return { name, score: avgBench - todayAmt, avgBench, todayAmt };
    })
    .filter(x => x.avgBench >= 10000)
    .sort((a, b) => b.score - a.score);

  const picks = ranked.slice(0, limit).map(r => r.name);

  if (picks.length < limit) {
    for (const it of topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), limit)) {
      if (!picks.includes(it.name)) picks.push(it.name);
      if (picks.length >= limit) break;
    }
  }

  for (const it of ranked.slice(0, limit * 2)) {
    if (picks.length >= limit) break;
    if (!picks.includes(it.name)) picks.push(it.name);
  }

  return picks.slice(0, limit);
}

export function recommendRiseFocusItems(
  todayItems: ReportSnapshot['items'],
  benchmarkSnapshots: ReportSnapshot[],
  fromHour: number,
  toHour: number,
  limit = 5,
): string[] {
  const benchTotals = new Map<string, number>();
  let benchDays = 0;

  for (const snap of benchmarkSnapshots) {
    const filtered = filterItemsBetweenHours(snap?.items, fromHour, toHour);
    if (!filtered.length) continue;
    benchDays += 1;
    for (const it of topItems(filtered, 25)) {
      benchTotals.set(it.name, (benchTotals.get(it.name) || 0) + it.amount);
    }
  }

  if (benchDays === 0) {
    const todayTop = topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), limit);
    return todayTop.map(i => i.name);
  }

  const todayMap = new Map<string, number>();
  for (const it of topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), 25)) {
    todayMap.set(it.name, it.amount);
  }

  const ranked = [...todayMap.entries()]
    .map(([name, todayAmt]) => {
      const benchSum = benchTotals.get(name) || 0;
      const avgBench = benchSum / benchDays;
      return { name, score: todayAmt - avgBench, avgBench, todayAmt };
    })
    .filter(x => x.todayAmt >= 10000)
    .sort((a, b) => b.score - a.score);

  const picks = ranked.slice(0, limit).map(r => r.name);

  if (picks.length < limit) {
    for (const it of topItems(filterItemsBetweenHours(todayItems, fromHour, toHour), limit)) {
      if (!picks.includes(it.name)) picks.push(it.name);
      if (picks.length >= limit) break;
    }
  }

  return picks.slice(0, limit);
}

export async function analyzeSalesHourlyDrop(
  storeId: string,
  hour: number,
  baseDate = getKSTTodayYMD(),
): Promise<SalesHourlyAlertResult | null> {
  if (hour < SALES_ALERT_START_HOUR) return null;

  const dates = getCompareDates(baseDate);
  const todaySnap = await loadReportSnapshot(storeId, baseDate);
  if (!todaySnap) return null;

  const todayTotal = cumulativeSalesBetweenHours(todaySnap, SALES_ALERT_START_HOUR, hour);
  if (todayTotal <= 0) return null;

  const drops: SalesDropBenchmark[] = [];
  const benchmarkSnapshots: ReportSnapshot[] = [];

  for (const bm of BENCHMARKS) {
    const cmpDate = dates[bm.key];
    const snap = await loadReportSnapshot(storeId, cmpDate);
    if (!snap) continue;
    benchmarkSnapshots.push(snap);

    const benchTotal = cumulativeSalesBetweenHours(snap, SALES_ALERT_START_HOUR, hour);
    if (!isBenchmarkComparable(benchTotal, todayTotal)) continue;

    const dropPct = (benchTotal - todayTotal) / benchTotal;
    const absDrop = benchTotal - todayTotal;
    if (dropPct >= SALES_DROP_THRESHOLD && absDrop >= SALES_ALERT_MIN_ABS_DELTA) {
      drops.push({
        label: bm.label,
        date: cmpDate,
        amount: benchTotal,
        dropPct,
      });
    }
  }

  if (!drops.length) {
    return {
      triggered: false,
      todayTotal,
      hour,
      drops: [],
      focusItems: [],
      message: '',
    };
  }

  drops.sort((a, b) => b.dropPct - a.dropPct);
  const focusItems = recommendFocusItems(
    todaySnap.items,
    benchmarkSnapshots,
    SALES_ALERT_START_HOUR,
    hour,
  );

  const dropLines = drops
    .slice(0, 3)
    .map(d => formatBenchmarkAlertLine(d.label, d.amount, d.dropPct, 'down'))
    .join(', ');

  const itemLines = focusItems.length
    ? focusItems.map((name, i) => `${i + 1}. ${name}`).join('\n')
    : '데이터 부족 — 전일 인기 품목 위주로 진열·프로모션 점검';

  const message = [
    `${SALES_ALERT_START_HOUR}~${hour}시 순매출 누적 ${todayTotal.toLocaleString()}원`,
    `기준 대비 하락: ${dropLines}`,
    '',
    '주력 추천 품목:',
    itemLines,
    '',
    '발주·진열·프로모션 추가 점검을 권장합니다.',
  ].join('\n');

  return {
    triggered: true,
    todayTotal,
    hour,
    drops,
    focusItems,
    message,
  };
}

export async function analyzeSalesHourlyRise(
  storeId: string,
  hour: number,
  baseDate = getKSTTodayYMD(),
): Promise<SalesHourlyRiseAlertResult | null> {
  if (hour < SALES_ALERT_START_HOUR) return null;

  const dates = getCompareDates(baseDate);
  const todaySnap = await loadReportSnapshot(storeId, baseDate);
  if (!todaySnap) return null;

  const todayTotal = cumulativeSalesBetweenHours(todaySnap, SALES_ALERT_START_HOUR, hour);
  if (todayTotal <= 0) return null;

  const rises: SalesRiseBenchmark[] = [];
  const benchmarkSnapshots: ReportSnapshot[] = [];

  for (const bm of BENCHMARKS) {
    const cmpDate = dates[bm.key];
    const snap = await loadReportSnapshot(storeId, cmpDate);
    if (!snap) continue;
    benchmarkSnapshots.push(snap);

    const benchTotal = cumulativeSalesBetweenHours(snap, SALES_ALERT_START_HOUR, hour);
    if (!isBenchmarkComparable(benchTotal, todayTotal)) continue;

    const risePct = (todayTotal - benchTotal) / benchTotal;
    const absRise = todayTotal - benchTotal;
    if (risePct >= SALES_RISE_THRESHOLD && absRise >= SALES_ALERT_MIN_ABS_DELTA) {
      rises.push({
        label: bm.label,
        date: cmpDate,
        amount: benchTotal,
        risePct,
      });
    }
  }

  if (!rises.length) {
    return {
      triggered: false,
      todayTotal,
      hour,
      rises: [],
      focusItems: [],
      message: '',
    };
  }

  rises.sort((a, b) => b.risePct - a.risePct);
  const focusItems = recommendRiseFocusItems(
    todaySnap.items,
    benchmarkSnapshots,
    SALES_ALERT_START_HOUR,
    hour,
  );

  const riseLines = rises
    .slice(0, 3)
    .map(r => formatBenchmarkAlertLine(r.label, r.amount, r.risePct, 'up'))
    .join(', ');

  const itemLines = focusItems.length
    ? focusItems.map((name, i) => `${i + 1}. ${name}`).join('\n')
    : '데이터 부족 — 당일 인기 품목 위주로 재고·진열을 유지하세요';

  const message = [
    `${SALES_ALERT_START_HOUR}~${hour}시 순매출 누적 ${todayTotal.toLocaleString()}원`,
    `기준 대비 상승: ${riseLines}`,
    '',
    '잘 팔린 품목:',
    itemLines,
    '',
    '재고·진열을 유지하고 프로모션을 이어가세요.',
  ].join('\n');

  return {
    triggered: true,
    todayTotal,
    hour,
    rises,
    focusItems,
    message,
  };
}

export async function getStoreActiveUserIds(storeId: string): Promise<string[]> {
  const mapSnap = await adminDb.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();
  return [...new Set(mapSnap.docs.map(d => d.data().uid as string).filter(Boolean))];
}
