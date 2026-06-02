/**
 * AI 매출 예측 — 다기준 비교·외부 API·종합 코멘트·품목 근거 보강
 */

import { fetchDailyReportsSince } from '@/lib/dashboardSalesData';
import type { PredictionItemStat } from '@/lib/dashboardSalesData';
import { loadSystemContext } from '@/lib/aiStoreContext';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';
import { fetchCommercialArea, fetchNaverNewsHeadlines } from '@/lib/areaContext';
import { getCompareDates } from '@/lib/reportCompare';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { itemNamesMatch } from '@/lib/itemNameMatch';
import {
  getKSTTodayYMD,
  subtractMonthsYMD,
  subtractYearsYMD,
} from '@/lib/dateUtils';
import {
  formatBenchmarkDateLabel,
  resolveHolidaySetForYmdList,
  type PredictionScheduleContext,
} from '@/lib/predictionCalendarContext';
import { formatItemDailyAvgReason } from '@/lib/salesMetricRules';
import type { PredictionCalibration } from '@/lib/predictionAnalysis';
import {
  formatUpliftReasonDetail,
  rankItemsWithUpliftAndContext,
  type ItemUpliftMetrics,
  type PredictionRankContext,
} from '@/lib/predictionUpliftRank';

export const PREDICTION_TOP_N = 10;
export const PREDICTION_ITEM_POOL = 30;

const API_KEY = process.env.PUBLIC_DATA_API_KEY;
const MEAT_URL = 'http://apis.data.go.kr/1390802/SurveyYHCityPriceService/getSurveyYHCityPriceList';

export interface BenchmarkKey {
  key: string;
  label: string;
  date: string;
  /** YYYY-MM-DD(요일)·휴일명 — 근거 표기용 */
  dateFull: string;
}

export interface ItemBenchmark {
  name: string;
  dailyAvg90: number;
  salesDays: number;
  amount90: number;
  benchmarks: Record<string, number>;
  trend3mPct: number | null;
  todayScore: number;
  reasonDetail: string;
}

export interface PredictionEnrichment {
  benchmarkDates: BenchmarkKey[];
  itemBenchmarks: Map<string, ItemBenchmark>;
  dataBlocks: {
    compare: string;
    trend3m: string;
    news: string;
    naverTrend: string;
    meat: string;
    commercial: string;
    storeSales: string;
  };
  supporterComment: string;
  analysisSourcesLine: string;
  dataSourceStatus: Record<string, string>;
}

function getExtendedBenchmarkDates(today: string): Omit<BenchmarkKey, 'dateFull'>[] {
  const base = getCompareDates(today);
  const extra: Omit<BenchmarkKey, 'dateFull'>[] = [
    { key: 'twoMonthsSame', label: '전전월동일', date: subtractMonthsYMD(today, 2) },
    { key: 'threeMonthsSame', label: '전전전월동일', date: subtractMonthsYMD(today, 3) },
  ];
  const fromCompare: Omit<BenchmarkKey, 'dateFull'>[] = [
    { key: 'yesterday', label: '전일', date: base.yesterday },
    { key: 'lastWeekDow', label: '전주동요일', date: base.lastWeekDow },
    { key: 'lastMonthSame', label: '전월동일', date: base.lastMonthSame },
    { key: 'lastMonthDow', label: '전월동요일', date: base.lastMonthDow },
    { key: 'lastYearMonthSame', label: '전년동월동일', date: base.lastYearMonthSame },
    { key: 'lastYearMonthDow', label: '전년동월동요일', date: base.lastYearMonthDow },
    ...extra,
  ];
  return fromCompare;
}

async function buildSalesByDateMap(storeId: string, sinceYmd: string, todayYmd: string) {
  const byDate: Record<string, Record<string, number>> = {};
  const drSnap = await fetchDailyReportsSince(storeId, sinceYmd);
  if (!drSnap?.empty) {
    const reports = drSnap.docs.map(d => ({
      ...d.data(),
      reportDate: d.data().reportDate as string,
      storeId: d.data().storeId as string,
      items: d.data().items as Array<{ name?: string; qty?: number; netSales?: number; amount?: number }> | undefined,
    }));
    for (const d of pickBestReportByDate(reports, storeId).values()) {
      const date = d.reportDate || '';
      if (!date || date > todayYmd) continue;
      if (!byDate[date]) byDate[date] = {};
      (d.items || []).forEach(item => {
        const name = String(item.name || '').trim();
        if (!name) return;
        const amt = Number(item.netSales || item.amount || 0);
        byDate[date][name] = (byDate[date][name] || 0) + amt;
      });
    }
  }
  return byDate;
}

function amountOnDate(
  byDate: Record<string, Record<string, number>>,
  date: string,
  itemName: string,
  allNames: string[],
): number {
  const day = byDate[date];
  if (!day) return 0;
  if (day[itemName]) return day[itemName];
  const hit = allNames.find(n => itemNamesMatch(n, itemName) && day[n]);
  return hit ? day[hit] : 0;
}

function monthKey(ymd: string) {
  return ymd.slice(0, 7);
}

function calc3MonthTrend(
  byDate: Record<string, Record<string, number>>,
  itemName: string,
  _today: string,
  allNames: string[],
): number | null {
  const sums: Record<string, number> = {};
  Object.entries(byDate).forEach(([date, items]) => {
    const ym = monthKey(date);
    const amt = amountOnDate({ [date]: items }, date, itemName, allNames);
    sums[ym] = (sums[ym] || 0) + amt;
  });
  const months = Object.keys(sums).sort().reverse().slice(0, 3);
  if (months.length < 2) return null;
  const recent = sums[months[0]] || 0;
  const prev = months.slice(1).reduce((s, ym) => s + (sums[ym] || 0), 0) / Math.max(months.length - 1, 1);
  if (prev <= 0) return recent > 0 ? 100 : null;
  return Math.round(((recent - prev) / prev) * 100);
}

function todayExpectationScore(
  stat: PredictionItemStat,
  bench: Record<string, number>,
  trend3m: number | null,
): number {
  const y = bench.yesterday || 0;
  const w = bench.lastWeekDow || 0;
  const m = bench.lastMonthDow || 0;
  const avg = stat.dailyAvgSales;
  let score = avg * 0.35 + y * 0.25 + w * 0.2 + m * 0.15;
  if (trend3m != null && trend3m > 0) score *= 1 + Math.min(trend3m, 40) / 200;
  if (trend3m != null && trend3m < -15) score *= 0.85;
  return Math.round(score);
}

function buildItemReasonDetail(
  stat: PredictionItemStat,
  bench: Record<string, number>,
  labels: BenchmarkKey[],
  trend3m: number | null,
  totalAmount: number,
  tier: 'top' | 'bottom' | 'spotlight' | 'base',
): string {
  const share = Math.round((stat.amount / totalAmount) * 100);
  const parts = [
    formatItemDailyAvgReason(stat.amount, stat.salesDays, stat.dailyAvgSales, share),
  ];
  labels.forEach(l => {
    const v = bench[l.key] ?? 0;
    const dateLabel = l.dateFull || l.label;
    parts.push(
      v > 0
        ? `[${dateLabel}] ${v.toLocaleString()}원`
        : `[${dateLabel}] 매출 없음`,
    );
  });
  if (trend3m != null) parts.push(`[3개월 추이] ${trend3m > 0 ? '+' : ''}${trend3m}%`);
  parts.push(tier === 'top' ? '[판단] 동요일·전일 대비 상위권' : '[판단] 하위·감소 추세');
  return parts.join('\n').slice(0, 480);
}

async function fetchMeatPriceSnippet(): Promise<string> {
  if (!API_KEY) return '';
  try {
    const today = new Date();
    const params = new URLSearchParams({
      serviceKey: API_KEY,
      numOfRows: '3',
      pageNo: '1',
      resultType: 'json',
      stYear: String(today.getFullYear()),
      stMonth: String(today.getMonth() + 1).padStart(2, '0'),
      stDay: String(today.getDate()).padStart(2, '0'),
      itemCode: '00200',
    });
    const res = await fetch(`${MEAT_URL}?${params}`, { signal: AbortSignal.timeout(6000) });
    const data = await res.json();
    const item = data?.response?.body?.items?.item;
    const first = Array.isArray(item) ? item[0] : item;
    if (!first?.price) return '';
    return `축산도매 돼지삼겹 ${Number(first.price).toLocaleString()}원/100g`;
  } catch {
    return '';
  }
}

export async function buildPredictionEnrichment(opts: {
  storeId: string;
  /** 예측 대상일(오늘) — 동요일·휴일 비교 기준 */
  today?: string;
  /** 판매 집계 마감일(전일까지) */
  dataThroughYmd?: string;
  sortedItems: PredictionItemStat[];
  schedule: PredictionScheduleContext | null;
  weatherLine: string;
  dowLabel: string;
  contextInfo: string;
  activeWeatherVars: number;
  regionSido?: string;
  regionSigungu?: string;
}): Promise<PredictionEnrichment> {
  const today = opts.today || getKSTTodayYMD();
  const dataThrough = opts.dataThroughYmd || today;
  const since = subtractYearsYMD(today, 1);
  const benchmarkDatesRaw = getExtendedBenchmarkDates(today);
  const allNames = opts.sortedItems.map(s => s.name);

  const holidaySet = await resolveHolidaySetForYmdList(
    API_KEY || process.env.PUBLIC_DATA_API_KEY || '',
    [today, ...benchmarkDatesRaw.map(b => b.date)],
  );
  const benchmarkDates: BenchmarkKey[] = benchmarkDatesRaw.map(b => ({
    ...b,
    dateFull: formatBenchmarkDateLabel(b.date, holidaySet, b.label),
  }));

  const [byDate, storeCtx, trendRes, news, commercial, meatSnippet] = await Promise.all([
    buildSalesByDateMap(opts.storeId, since, dataThrough),
    opts.storeId ? loadSystemContext(opts.storeId).catch(() => null) : Promise.resolve(null),
    opts.storeId ? fetchNaverTrendData(opts.storeId) : fetchNaverTrendData(''),
    fetchNaverNewsHeadlines(5),
    fetchCommercialArea(opts.regionSido || '서울', opts.regionSigungu || ''),
    fetchMeatPriceSnippet(),
  ]);

  const itemBenchmarks = new Map<string, ItemBenchmark>();
  const benchLabels = benchmarkDates;

  opts.sortedItems.forEach(stat => {
    const benchmarks: Record<string, number> = {};
    benchLabels.forEach(b => {
      benchmarks[b.key] = amountOnDate(byDate, b.date, stat.name, allNames);
    });
    const trend3m = calc3MonthTrend(byDate, stat.name, today, allNames);
    const todayScore = todayExpectationScore(stat, benchmarks, trend3m);
    itemBenchmarks.set(stat.name, {
      name: stat.name,
      dailyAvg90: stat.dailyAvgSales,
      salesDays: stat.salesDays,
      amount90: stat.amount,
      benchmarks,
      trend3mPct: trend3m,
      todayScore,
      reasonDetail: buildItemReasonDetail(
        stat, benchmarks, benchLabels, trend3m,
        opts.sortedItems.reduce((s, d) => s + d.amount, 0) || 1,
        'top',
      ),
    });
  });

  const topByScore = [...opts.sortedItems]
    .sort((a, b) => (itemBenchmarks.get(b.name)?.todayScore || 0) - (itemBenchmarks.get(a.name)?.todayScore || 0));

  const compareLines = benchLabels.map(b => {
    const total = Object.values(byDate[b.date] || {}).reduce((s, v) => s + v, 0);
    return `${b.dateFull}: 매장 품목합 ${total.toLocaleString()}원`;
  }).join('\n');

  const trend3mLines = topByScore.slice(0, PREDICTION_TOP_N).map(s => {
    const t = itemBenchmarks.get(s.name)?.trend3mPct;
    return `${s.name} 3개월 ${t == null ? '—' : `${t > 0 ? '+' : ''}${t}%`}`;
  }).join(', ');

  const newsBlock = news.length
    ? news.map(n => `[${n.keyword}] ${n.title}`).join(' | ')
    : '뉴스 API 미연동';

  const trendBlock = trendRes.trends.length
    ? trendRes.trends.slice(0, 4).map(t => `${t.groupName}지수${t.current}(${t.change > 0 ? '+' : ''}${t.change}%)`).join(', ')
    : (trendRes.operationHint || trendRes.error || '네이버데이터랩 미설정');

  const storeSalesLine = storeCtx
    ? `전일매출 ${Number(storeCtx.yesterdaySales?.netSales || storeCtx.yesterdaySales?.totalSales || 0).toLocaleString()}원`
    : '';

  const dataBlocks = {
    compare: compareLines,
    trend3m: trend3mLines,
    news: newsBlock.slice(0, 400),
    naverTrend: trendBlock.slice(0, 300),
    meat: meatSnippet,
    commercial: `${commercial.region} ${commercial.competitiveLevel} — ${commercial.businessSummary?.slice(0, 60)}`,
    storeSales: storeSalesLine,
  };

  const dataSourceStatus: Record<string, string> = {
    sales: opts.sortedItems.length > 0 ? '✅' : '❌',
    compare: Object.keys(byDate).length > 5 ? '✅' : '⚠️',
    purchases: '⚠️',
    weather: opts.weatherLine.includes('정보없음') ? '⚠️' : '✅',
    holiday: opts.schedule ? '✅' : '⚠️',
    naverTrend: trendRes.trends.length > 0 ? '✅' : (process.env.NAVER_CLIENT_ID ? '⚠️' : '❌'),
    news: news.length > 0 ? '✅' : (process.env.NAVER_CLIENT_ID ? '⚠️' : '❌'),
    meatPrice: meatSnippet ? '✅' : (API_KEY ? '⚠️' : '❌'),
    commercial: commercial.source === 'api' ? '✅' : '⚠️',
    cardPayment: '❌',
  };

  const top3 = topByScore.slice(0, 3).map(s => {
    const b = itemBenchmarks.get(s.name)!;
    const y = b.benchmarks.yesterday || 0;
    const w = b.benchmarks.lastWeekDow || 0;
    return `**${s.name}** ${s.dailyAvgSales.toLocaleString()}원·전일${y.toLocaleString()}·전주동요일${w.toLocaleString()}`;
  }).join(' / ');

  const tmr = opts.schedule?.tomorrowHoliday.label
    ? `내일 **${opts.schedule.tomorrowHoliday.label}**(${opts.schedule.tomorrowYmd}) 유동·소비 변동 예상. `
    : '';

  const parts = [
    `**${today}(${opts.dowLabel})** 정육점 매출 예측.`,
    tmr,
    opts.contextInfo,
    opts.weatherLine,
    dataBlocks.storeSales,
    `90일 POS ${Object.keys(byDate).length}일·상위품목 금액 기준.`,
    `주력: ${top3}.`,
    trend3mLines ? `3개월 추이: ${trend3mLines.slice(0, 120)}.` : '',
    news.length ? `이슈: ${news[0].title.slice(0, 40)}.` : '',
    trendBlock ? `검색: ${trendBlock.slice(0, 80)}.` : '',
    meatSnippet ? `${meatSnippet}.` : '',
    '상위 품목 재고·진열 우선, 내일 공휴일·날씨 반영 발주 권장.',
  ];

  const supporterComment = parts.filter(Boolean).join(' ').slice(0, 500);

  const refList = [
    '90일평균',
    '예측분석백테스트',
    '전일',
    '전주동요일',
    '전월동일·동요일',
    '전전월·전전전월동일',
    '전년동월',
    '3개월추이',
    '날씨',
    opts.schedule?.todayHoliday.label ? '오늘휴일' : '',
    opts.schedule?.tomorrowHoliday.label ? '내일공휴' : '',
    news.length ? '뉴스' : '',
    trendRes.trends.length ? '네이버트렌드' : '',
    meatSnippet ? '축산가격' : '',
    '매장휴무',
  ].filter(Boolean);

  const analysisSourcesLine =
    `참조: ${refList.slice(0, 10).join('·')} 등 ${refList.length}개 조건으로 분석했습니다.`.slice(0, 100);

  return {
    benchmarkDates,
    itemBenchmarks,
    dataBlocks,
    supporterComment,
    analysisSourcesLine,
    dataSourceStatus,
  };
}

export function enrichPredictionItemRows(
  rows: Array<Record<string, unknown>>,
  enrichment: PredictionEnrichment,
  sortedItems: PredictionItemStat[],
  tier: 'top' | 'bottom' | 'spotlight' | 'base',
  upliftMetrics?: Map<string, ItemUpliftMetrics>,
  contextLabels?: string[],
): Array<Record<string, unknown>> {
  const totalAmount = sortedItems.reduce((s, d) => s + d.amount, 0) || 1;
  return rows.map((raw, i) => {
    const name = String(raw.item || '').trim();
    const stat = sortedItems.find(s => itemNamesMatch(s.name, name)) || sortedItems[i];
    if (!stat) return raw;
    const bench = enrichment.itemBenchmarks.get(stat.name);
    const daily = stat.dailyAvgSales;
    const change = stat.changeVsLastWeek;
    const uplift = upliftMetrics?.get(stat.name);
    const badges: string[] = [];
    if (tier === 'spotlight') badges.push('✨주목');
    if (uplift && uplift.contextBoost >= 12) badges.push('🌤️이슈');
    if (uplift && uplift.upliftPct >= 15) badges.push('🔥HOT');
    else if (change >= 30) badges.push('🔥HOT');
    else if (change >= 10) badges.push('⬆️UP');
    else if (change <= -20) badges.push('📉DOWN');
    if (bench && bench.todayScore > stat.dailyAvgSales * 1.1 && tier !== 'spotlight') badges.push('💡추천');

    const reasonDetail = tier === 'spotlight' && uplift
      ? formatUpliftReasonDetail(stat, uplift, contextLabels || [])
      : bench?.reasonDetail || String(raw.reasonDetail || '');
    return {
      ...raw,
      rank: i + 1,
      item: stat.name,
      expectedSales: daily,
      dailyAvgSales: daily,
      salesDays: stat.salesDays,
      salesUnit: '원',
      changeVsLastWeek: change,
      confidence: Math.min(95, Math.max(50, 55 + Math.min(change, 25) + (bench?.benchmarks.yesterday ? 8 : 0))),
      badges: badges.length ? badges : (raw.badges as string[]) || [],
      reasons: enrichment.benchmarkDates
        .filter(b => (bench?.benchmarks[b.key] ?? 0) > 0)
        .slice(0, 4)
        .map(b => `${b.dateFull} ${(bench?.benchmarks[b.key] ?? 0).toLocaleString()}원`),
      reasonDetail: buildItemReasonDetail(
        stat,
        bench?.benchmarks || {},
        enrichment.benchmarkDates,
        bench?.trend3mPct ?? null,
        totalAmount,
        tier,
      ) || reasonDetail,
      displayRecommend: tier === 'spotlight'
        ? (uplift && uplift.upliftPct >= 20 ? '오늘 추가 진열' : '오늘 주목·진열 강화')
        : tier === 'top' || tier === 'base'
          ? (change >= 20 ? '추가 진열' : '기본 진열 유지')
          : '진열 축소',
      upliftPct: uplift?.upliftPct,
      contextBoost: uplift?.contextBoost,
    };
  });
}

/** 오늘 주목(상승·이슈) + 기본 메인 + 감소 예상 */
export function rankItemsForToday(
  sortedItems: PredictionItemStat[],
  enrichment: PredictionEnrichment,
  calibration?: PredictionCalibration | null,
  rankCtx?: PredictionRankContext,
): {
  topNames: string[];
  bottomNames: string[];
  baseTopNames: string[];
  contextLabels: string[];
  metricsByName: Map<string, ItemUpliftMetrics>;
} {
  if (!rankCtx) {
    const scored = sortedItems.map(s => ({
      name: s.name,
      score: enrichment.itemBenchmarks.get(s.name)?.todayScore ?? s.dailyAvgSales,
    }));
    const topNames = [...scored].sort((a, b) => b.score - a.score).slice(0, PREDICTION_TOP_N).map(s => s.name);
    const topSet = new Set(topNames);
    const bottomNames = [...scored].filter(s => !topSet.has(s.name)).sort((a, b) => a.score - b.score).slice(0, PREDICTION_TOP_N).map(s => s.name);
    return { topNames, bottomNames, baseTopNames: [], contextLabels: [], metricsByName: new Map() };
  }

  const benchMap = new Map(
    sortedItems.map(s => {
      const b = enrichment.itemBenchmarks.get(s.name);
      return [s.name, { benchmarks: b?.benchmarks || {}, todayScore: b?.todayScore ?? s.dailyAvgSales }];
    }),
  );
  const ranked = rankItemsWithUpliftAndContext(sortedItems, benchMap, rankCtx, calibration);
  return {
    topNames: ranked.spotlightTopNames,
    bottomNames: ranked.bottomNames,
    baseTopNames: ranked.baseTopNames,
    contextLabels: ranked.contextLabels,
    metricsByName: ranked.metricsByName,
  };
}
