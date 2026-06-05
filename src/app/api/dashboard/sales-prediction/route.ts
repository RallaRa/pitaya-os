import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { getStoreCoords, getWeatherCondition, WEATHER_ICONS } from '@/lib/weather';
import { verifyToken } from '@/lib/authVerify';
import { fetchDailyReportsSince, fetchPredictionItemStats } from '@/lib/dashboardSalesData';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import {
  getCurrentPredictionSlot,
  getPredictionDataThroughYmd,
  isDailyPredictionCacheValid,
  PREDICTION_LOCK_VERSION,
  PREDICTION_UPDATE_SCHEDULE_LABEL,
  formatDataThroughLabel,
} from '@/lib/predictionDailyLock';
import {
  applyCalibrationToPredictions,
  formatPredictionAccuracyDisplay,
  loadPredictionFeedbackForStore,
  mergeBottomWithCalibration,
  reorderTopItemsWithCalibration,
  savePredictionAnalysisDailyLog,
} from '@/lib/predictionAnalysis';
import { generateTextWithFallback, hasAnyAiProvider, stripJsonMarkdown } from '@/lib/aiProviderFallback';
import { aiMetaJson } from '@/lib/aiProviderMeta';
import { buildSalesPredictionEmptyReason } from '@/lib/dashboardEmptyReason';
import {
  buildStatisticalSupporterComment,
  isPlaceholderSupporterComment,
} from '@/lib/salesPredictionBuild';
import { buildPredictionScheduleContext } from '@/lib/predictionCalendarContext';
import {
  buildPredictionEnrichment,
  enrichPredictionItemRows,
  PREDICTION_ITEM_POOL,
  rankItemsForToday,
} from '@/lib/predictionEnrichment';
import { itemNamesMatch } from '@/lib/itemNameMatch';
import { SALES_METRIC_RULES_PROMPT } from '@/lib/salesMetricRules';
import {
  buildSlotChangeContext,
  buildSlotChangeSummaryShort,
  compactSlotFromResult,
  getPriorSlotsToday,
  mergeSlotHistory,
  type SlotHistoryMap,
} from '@/lib/predictionSlotHistory';
import { ensureWeatherVariablesCalibrated, runWeatherItemCalibration } from '@/lib/weatherItemCalibration';
import { annotateCompareDatesInComment } from '@/lib/annotateCompareDatesInText';
import { PREDICTION_POS_REFRESH_LABEL } from '@/lib/predictionRefreshConfig';
import {
  enrichPredictionItemsWithTodayActual,
  isTodayActualCacheFresh,
} from '@/lib/predictionTodayActual';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function serializePredictionDoc(data: Record<string, unknown>) {
  const g = data.generatedAt as { toDate?: () => Date } | string | undefined;
  const generatedAt =
    g && typeof g === 'object' && typeof g.toDate === 'function'
      ? g.toDate().toISOString()
      : g;
  return { ...data, generatedAt };
}

async function fetchWeatherForecast(coords: {lat:number;lng:number}) {
  try {
    const today = getKSTTodayYMD();
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${coords.lat}&longitude=${coords.lng}&daily=temperature_2m_max,temperature_2m_min,weathercode,precipitation_probability_max,precipitation_sum&timezone=Asia%2FSeoul&start_date=${today}&end_date=${today}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    const json = await res.json();
    const precipMm = Math.round((json.daily?.precipitation_sum?.[0] ?? 0) * 10) / 10;
    return {
      tempMax: Math.round(json.daily?.temperature_2m_max?.[0] ?? 20),
      tempMin: Math.round(json.daily?.temperature_2m_min?.[0] ?? 10),
      precipProb: Math.round(json.daily?.precipitation_probability_max?.[0] ?? 0),
      precipMm,
      condition: getWeatherCondition(json.daily?.weathercode?.[0] ?? 0),
    };
  } catch { return null; }
}

function isCronAuthorized(req: Request): boolean {
  const secret = req.headers.get('x-cron-secret');
  return Boolean(process.env.CRON_SECRET && secret === process.env.CRON_SECRET);
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  const cronOk = isCronAuthorized(req);
  if (!authUser && !cronOk) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const refresh = searchParams.get('refresh') === '1';

  const today = getKSTTodayYMD();
  const dataThroughYmd = getPredictionDataThroughYmd();
  const slot = getCurrentPredictionSlot();
  const cacheRef = adminDb.collection('predictions').doc(today + '_' + (storeId || 'global'));

  let slotHistory: SlotHistoryMap = {};
  if (storeId && !refresh) {
    try {
      const prevSnap = await cacheRef.get();
      if (prevSnap.exists) {
        slotHistory = (prevSnap.data()?.slotHistory as SlotHistoryMap) || {};
      }
    } catch { /* ignore */ }
  } else if (storeId && refresh) {
    try {
      const prevSnap = await cacheRef.get();
      if (prevSnap.exists) {
        slotHistory = (prevSnap.data()?.slotHistory as SlotHistoryMap) || {};
      }
    } catch { /* keep history on force refresh */ }
  }
  const priorSlotsToday = getPriorSlotsToday(slotHistory, slot.slotHour, today);

  // 당일 갱신 슬롯 고정 (00·10·15·18시 KST — refresh=1 일 때만 재생성)
  if (!refresh) {
    try {
      const cached = await cacheRef.get();
      if (cached.exists && isDailyPredictionCacheValid(
        cached.data() as Record<string, unknown>,
        today,
        slot.slotHour,
      )) {
        const d = cached.data()!;
        let cachedBody: Awaited<ReturnType<typeof enrichPredictionItemsWithTodayActual>>;
        if (
          isTodayActualCacheFresh(d.todayActualUpdatedAt)
          && Array.isArray(d.topItems)
          && (d.topItems as Array<Record<string, unknown>>).some(
            row => row.todayActualSales !== undefined && row.todayActualSales !== null,
          )
        ) {
          cachedBody = {
            topItems: (d.topItems as Array<Record<string, unknown>>) || [],
            baseTopItems: (d.baseTopItems as Array<Record<string, unknown>>) || [],
            bottomItems: (d.bottomItems as Array<Record<string, unknown>>) || [],
            todaySalesAsOf: String(d.todaySalesAsOf || today),
            hasTodaySalesData: Boolean(d.hasTodaySalesData),
            todayActualUpdatedAt: d.todayActualUpdatedAt,
          };
        } else {
          cachedBody = {
            topItems: (d.topItems as Array<Record<string, unknown>>) || [],
            baseTopItems: (d.baseTopItems as Array<Record<string, unknown>>) || [],
            bottomItems: (d.bottomItems as Array<Record<string, unknown>>) || [],
            todaySalesAsOf: String(d.todaySalesAsOf || today),
            hasTodaySalesData: Boolean(d.hasTodaySalesData),
            todayActualUpdatedAt: d.todayActualUpdatedAt,
          };
        }
        return NextResponse.json({
          ...serializePredictionDoc(d as Record<string, unknown>),
          ...cachedBody,
          cached: true,
          dailyLocked: true,
          dataThroughYmd: String(d.dataThroughYmd || dataThroughYmd),
          dataThroughLabel: formatDataThroughLabel(String(d.dataThroughYmd || dataThroughYmd)),
          lockSlotHour: d.lockSlotHour ?? slot.slotHour,
          lockSlotLabel: String(d.lockSlotLabel || slot.slotLabel),
          updateSchedule: PREDICTION_UPDATE_SCHEDULE_LABEL,
          posRefreshSchedule: PREDICTION_POS_REFRESH_LABEL,
          nextUpdateLabel: slot.nextSlotLabel,
        });
      }
    } catch { /* regenerate */ }
  }

  const apiKey = process.env.PUBLIC_DATA_API_KEY || '';
  let regionSido = '서울';
  let regionSigungu = '';
  const coords = await (async () => {
    if (!storeId) return { lat: 37.5665, lng: 126.9780 };
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      const d = snap.data();
      regionSido = d?.regionSido || regionSido;
      regionSigungu = d?.regionSigungu || '';
      return getStoreCoords(regionSido);
    } catch { return { lat: 37.5665, lng: 126.9780 }; }
  })();

  const predictionDate = today;

  // 병렬 데이터 수집
  const since90 = addDaysYMD(today, -90);

  const forceCalibrate = searchParams.get('calibrate') === '1';

  const [salesSnap, purchasesSnap, weatherRes, scheduleRes, calibrateRes, itemStatsRes, feedbackRes] = await Promise.allSettled([
    fetchDailyReportsSince(storeId, since90),
    adminDb.collection('purchases')
      .where('storeId', '==', storeId)
      .orderBy('purchaseDate', 'desc').limit(30).get(),
    fetchWeatherForecast(coords),
    buildPredictionScheduleContext(storeId, apiKey, today),
    storeId
      ? (forceCalibrate
          ? runWeatherItemCalibration(storeId, { regionSido, force: true }).then(r => r.variables)
          : ensureWeatherVariablesCalibrated(storeId, regionSido)
        ).catch(() => [] as Awaited<ReturnType<typeof ensureWeatherVariablesCalibrated>>)
      : Promise.resolve([]),
    fetchPredictionItemStats(storeId, since90, dataThroughYmd, PREDICTION_ITEM_POOL),
    storeId ? loadPredictionFeedbackForStore(storeId) : Promise.resolve(null),
  ]);

  const predictionFeedback =
    feedbackRes.status === 'fulfilled' && feedbackRes.value ? feedbackRes.value : null;

  const sales = salesSnap.status === 'fulfilled' && salesSnap.value ? salesSnap.value.docs : [];
  const purchases = purchasesSnap.status === 'fulfilled' ? purchasesSnap.value.docs : [];
  const weather = weatherRes.status === 'fulfilled' ? weatherRes.value : null;
  const schedule = scheduleRes.status === 'fulfilled' ? scheduleRes.value : null;
  const calibratedVars =
    calibrateRes.status === 'fulfilled' && Array.isArray(calibrateRes.value) && calibrateRes.value.length > 0
      ? calibrateRes.value
      : null;
  const activeVars = (calibratedVars || [])
    .filter((v: { active?: boolean }) => v.active !== false);

  // 데이터 소스 상태
  const dataSourceStatus: Record<string, string> = {
    sales:    sales.length > 0 ? '✅' : '❌',
    purchases: purchases.length > 0 ? '✅' : '❌',
    weather:  weather ? '✅' : '❌',
    holiday:  schedule ? '✅' : '⚠️',
    weatherVars: activeVars.length > 0 ? '✅' : '⚠️',
    naverTrend: process.env.NAVER_CLIENT_ID ? '⚠️' : '❌',
    meatPrice:  apiKey ? '⚠️' : '❌',
    cardPayment: '❌',
  };

  const sortedItems =
    itemStatsRes.status === 'fulfilled' && itemStatsRes.value.length > 0
      ? itemStatsRes.value
      : [];
  const todayDow = new Date(`${today}T12:00:00+09:00`).getDay();
  const dowNames = ['일','월','화','수','목','금','토'];
  const isHoliday = schedule?.todayHoliday.isHoliday ?? false;
  const isTmrHoliday = schedule?.tomorrowHoliday.isHoliday ?? false;
  const isWeekend = todayDow === 0 || todayDow === 6;
  const monthDay = Number(today.slice(8, 10));
  const isPayDay = monthDay >= 22 && monthDay <= 28;

  const scheduleNotes = [
    schedule?.tomorrowHoliday.label
      ? `**내일(${schedule.tomorrowYmd}) ${schedule.tomorrowHoliday.label}** — 소비·유동 변동, 발주·진열·인력 조정 검토.`
      : isTmrHoliday
        ? `**내일(${schedule?.tomorrowYmd || ''}) 공휴일** — 매출 패턴 변동 가능.`
        : '',
    schedule?.absenceTomorrow.length
      ? `내일 매장 휴무·결원: ${schedule.absenceTomorrow.join(', ')}.`
      : '',
    schedule?.absenceToday.length
      ? `오늘 매장 휴무·결원: ${schedule.absenceToday.join(', ')}.`
      : '',
  ].filter(Boolean).join(' ');

  if (sortedItems.length === 0) {
    const emptyReason = buildSalesPredictionEmptyReason({
      storeId,
      salesReportDays: sales.length,
      hasAi: hasAnyAiProvider(),
    });
    const fallback = {
      predictionDate,
      supporterComment: '',
      topItems: [], bottomItems: [], keyFactors: [],
      dataSourceStatus, activeVariables: activeVars.length,
      modelAccuracy: 0, noData: true, emptyReason,
      generatedAt: FieldValue.serverTimestamp(),
    };
    await cacheRef.set(fallback).catch(()=>{});
    return NextResponse.json({ ...fallback, cached: false });
  }

  const weatherContext = weather
    ? `날씨: ${weather.condition}, 최고${weather.tempMax}°/최저${weather.tempMin}°, 강수확률${weather.precipProb}%`
    : '날씨: 정보없음';

  const contextInfo = [
    `오늘: ${today} (${dowNames[todayDow]}요일)${schedule?.todayHoliday.label ? ` — ${schedule.todayHoliday.label}` : isHoliday ? ' — 공휴일' : isWeekend ? ' — 주말' : ' — 평일'}`,
    `내일: ${schedule?.tomorrowYmd || ''} (${schedule?.tomorrowDow || ''}요일)${schedule?.tomorrowHoliday.label ? ` — ${schedule.tomorrowHoliday.label}` : isTmrHoliday ? ' — 공휴일' : ''}`,
    weatherContext,
    isPayDay ? '급여일 인근 (소비증가 가능)' : '',
    activeVars.length > 0 ? `활성 날씨변수 ${activeVars.length}개` : '',
  ].filter(Boolean).join(' | ');

  const dowLabel = `${dowNames[todayDow]}요일`;

  const enrichment = await buildPredictionEnrichment({
    storeId,
    today,
    dataThroughYmd,
    sortedItems,
    schedule,
    weatherLine: weatherContext,
    dowLabel,
    contextInfo,
    activeWeatherVars: activeVars.length,
    regionSido,
    regionSigungu,
  });

  const summaryLines = sortedItems.map(d => {
    const b = enrichment.itemBenchmarks.get(d.name);
    const benchStr = b
      ? enrichment.benchmarkDates
          .slice(0, 4)
          .map(k => `${k.dateFull}=${(b.benchmarks[k.key] || 0).toLocaleString()}원`)
          .join(', ')
      : '';
    return `${d.name}: 90일=${d.amount.toLocaleString()}원/${d.salesDays}일, 일평균=${d.dailyAvgSales.toLocaleString()}원, ${benchStr}, 3개월${b?.trend3mPct != null ? `${b.trend3mPct > 0 ? '+' : ''}${b.trend3mPct}%` : '—'}`;
  }).join('\n');

  const predictionFeedbackText = predictionFeedback?.insightsText || '';

  let aiInfo: ReturnType<typeof aiMetaJson> | undefined;
  let topItems: any[] = [];
  let bottomItems: any[] = [];
  let supporterComment = '';
  let keyFactors: string[] = [];
  let aiUsedStatisticalFallback = false;
  let aiFailureReason: string | null = null;

  const totalAmount = sortedItems.reduce((s, d) => s + d.amount, 0) || 1;
  const weatherLine = weatherContext;

  const statisticalComment = buildStatisticalSupporterComment({
    today,
    dowLabel,
    contextInfo,
    scheduleNotes,
    sortedItems,
    weatherLine,
    salesReportDays: sales.length,
  });

  const rankCtx = {
    todayYmd: today,
    weather: weather
      ? {
          tempMax: weather.tempMax,
          tempMin: weather.tempMin,
          precipProb: weather.precipProb,
          precipMm: weather.precipMm,
          condition: weather.condition,
        }
      : null,
    schedule,
    activeVariables: activeVars,
  };

  const {
    topNames,
    bottomNames,
    baseTopNames,
    contextLabels,
    metricsByName,
  } = rankItemsForToday(
    sortedItems,
    enrichment,
    predictionFeedback?.calibration,
    rankCtx,
  );

  const buildRows = (
    names: string[],
    tier: 'spotlight' | 'base' | 'bottom',
  ) =>
    enrichPredictionItemRows(
      names.map((name, i) => ({ item: name, rank: i + 1 })),
      enrichment,
      sortedItems,
      tier,
      metricsByName,
      contextLabels,
    );

  topItems = buildRows(topNames, 'spotlight');
  const baseTopItems = buildRows(baseTopNames, 'base');
  bottomItems = buildRows(bottomNames, 'bottom');
  supporterComment = enrichment.supporterComment || statisticalComment;
  let analysisSourcesLine = enrichment.analysisSourcesLine;
  Object.assign(dataSourceStatus, enrichment.dataSourceStatus);
  dataSourceStatus.predictionAnalysis = predictionFeedback?.calibration.recentScores.length
    ? '✅'
    : '⚠️';

  if (contextLabels.length > 0 && !keyFactors.some(k => k.includes('이슈'))) {
    keyFactors = [...keyFactors, `오늘 이슈: ${contextLabels.slice(0, 4).join(', ')}`].slice(0, 6);
  }

  const currentTopCompact = topItems.map((it, i) => ({
    rank: Number(it.rank) || i + 1,
    item: String(it.item || ''),
    expectedSales: Number(it.dailyAvgSales ?? it.expectedSales) || 0,
  }));

  const slotChangeContext = buildSlotChangeContext({
    predictionDate: today,
    dataThroughYmd,
    currentSlotHour: slot.slotHour,
    currentSlotLabel: slot.slotLabel,
    priorSlots: priorSlotsToday,
    currentTop: currentTopCompact,
    keyFactors,
  });

  const prompt = `정육점 AI 매출 예측 — **종합 의견만** JSON으로 응답. 품목 수치는 서버 통계가 채웁니다.

${SALES_METRIC_RULES_PROMPT}

[당일 시간대 예측 비교 — 전일 마감 데이터 동일, 당일 이전 슬롯만 참조]
${slotChangeContext}

[컨텍스트]
${contextInfo}
${schedule?.scheduleBlock ? `\n[휴일·매장휴무]\n${schedule.scheduleBlock}` : ''}
${predictionFeedbackText ? `\n[예측분석 사이드바 — 백테스트·실적 비교, 반영 필수]\n${predictionFeedbackText}` : ''}

[기간별 매출 비교]
${enrichment.dataBlocks.compare}

[3개월 품목 추이]
${enrichment.dataBlocks.trend3m}

[품목 상세]
${summaryLines}

[네이버 트렌드] ${enrichment.dataBlocks.naverTrend}
[뉴스] ${enrichment.dataBlocks.news}
[축산가격] ${enrichment.dataBlocks.meat}
[상권] ${enrichment.dataBlocks.commercial}
${enrichment.dataBlocks.storeSales}

반드시 반영: 오늘 주목 품목은 평소대비 상승·날씨·공휴일·기념일 중심(절대매출만으로 설명 금지). 품목일평균매출(매출÷판매일수), 전일, 전주동요일, 3개월추이, 뉴스·검색. 객단가·건당매출은 매장 요약에만.

JSON만:
{
  "supporterComment": "450~500자. ①당일 직전 갱신 대비 TOP·요인 변화(있으면 필수) ②변화 원인 ③오늘·내일·공휴일·날씨 ④TOP·일평균 ⑤실행. **볼드** 핵심만",
  "keyFactors": ["변수1","변수2","변수3","변수4","변수5"]
}`;

  const applyStatisticalFallback = (failureReason?: string) => {
    supporterComment = enrichment.supporterComment || statisticalComment;
    aiUsedStatisticalFallback = true;
    if (failureReason) aiFailureReason = failureReason;
    if (keyFactors.length === 0) {
      keyFactors = [
        predictionFeedback?.calibration.avgAccuracy != null
          ? `예측분석 적중률 ${predictionFeedback.calibration.avgAccuracy}%`
          : '',
        dowLabel,
        weather?.condition || '날씨',
        schedule?.todayHoliday.label || (isHoliday ? '오늘 공휴일' : isWeekend ? '주말' : '평일'),
        schedule?.tomorrowHoliday.label ? `내일 ${schedule.tomorrowHoliday.label}` : isTmrHoliday ? '내일 공휴일' : '',
        '품목일평균매출',
        '전주동요일',
      ].filter(Boolean) as string[];
    }
  };

  if (hasAnyAiProvider()) {
    try {
      const aiResult = await generateTextWithFallback({ prompt, json: true, useCase: 'prediction' });
      const parsed = JSON.parse(stripJsonMarkdown(aiResult.text));
      aiInfo = aiMetaJson(aiResult);
      if (Array.isArray(parsed.keyFactors) && parsed.keyFactors.length > 0) {
        keyFactors = parsed.keyFactors.map(String);
      }
      if (schedule?.tomorrowHoliday.label) {
        const tag = `내일 ${schedule.tomorrowHoliday.label}`;
        if (!keyFactors.some(k => k.includes('내일') || k.includes('선거') || k.includes('공휴'))) {
          keyFactors = [...keyFactors, tag].slice(0, 6);
        }
      }
      let aiComment = String(parsed.supporterComment || '').slice(0, 500);
      if (
        schedule?.tomorrowHoliday.label &&
        !aiComment.includes(schedule.tomorrowHoliday.label) &&
        !aiComment.includes('내일')
      ) {
        const prefix = `내일(${schedule.tomorrowYmd}) **${schedule.tomorrowHoliday.label}** — 매출·유동 변동 가능. `;
        aiComment = (prefix + aiComment).slice(0, 500);
      }
      if (!isPlaceholderSupporterComment(aiComment)) {
        supporterComment = aiComment;
        aiUsedStatisticalFallback = false;
        aiFailureReason = null;
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'AI 호출 실패';
      aiFailureReason = `AI 종합 의견 생성 실패(${msg.slice(0, 80)}). 품목·코멘트는 다기준 통계로 표시합니다.`;
      applyStatisticalFallback(aiFailureReason);
    }
  } else {
    aiFailureReason = 'AI API 키 미설정 — 다기준 통계·외부 API 기반입니다.';
    applyStatisticalFallback();
  }

  if (!supporterComment.trim() || isPlaceholderSupporterComment(supporterComment)) {
    supporterComment = enrichment.supporterComment || statisticalComment;
    applyStatisticalFallback();
  }

  const statDailyMap = new Map(sortedItems.map(s => [s.name, s.dailyAvgSales]));
  const calibration = predictionFeedback?.calibration;
  if (calibration && topItems.length > 0) {
    topItems = applyCalibrationToPredictions(topItems, calibration, statDailyMap);
    topItems = reorderTopItemsWithCalibration(topItems, calibration);
    bottomItems = mergeBottomWithCalibration(
      bottomItems,
      calibration,
      topItems.map(it => String(it.item || '')),
      statDailyMap,
    );
    topItems = topItems.map(it => {
      const stat = sortedItems.find(s => itemNamesMatch(s.name, String(it.item || '')));
      const daily = stat?.dailyAvgSales ?? (Number(it.dailyAvgSales ?? it.expectedSales) || 0);
      const note = calibration.frequentlyMissed.some(r => itemNamesMatch(r, String(it.item || '')))
        ? '\n[예측분석] 실적 TOP 누락 빈번 → 순위 상향'
        : calibration.reliableItems.some(r => itemNamesMatch(r, String(it.item || '')))
          ? '\n[예측분석] 안정 적중 품목'
          : '';
      return {
        ...it,
        expectedSales: daily,
        dailyAvgSales: daily,
        salesUnit: '원',
        reasonDetail: String(it.reasonDetail || '') + note,
      };
    });
  }

  if (predictionFeedback?.modelAccuracy != null) {
    analysisSourcesLine = `${analysisSourcesLine} · 예측분석 ${predictionFeedback.modelAccuracy}%`.slice(0, 100);
  }

  const finalTopCompact = topItems.map((it, i) => ({
    rank: Number(it.rank) || i + 1,
    item: String(it.item || ''),
    expectedSales: Number(it.dailyAvgSales ?? it.expectedSales) || 0,
  }));
  const slotChangeSummary = buildSlotChangeSummaryShort(
    priorSlotsToday,
    finalTopCompact,
    slot.slotLabel,
    dataThroughYmd,
  );
  if (
    slotChangeSummary &&
    priorSlotsToday.length > 0 &&
    !supporterComment.includes('갱신') &&
    !supporterComment.includes('변화')
  ) {
    const prefix = `[${slotChangeSummary}] `;
    supporterComment = (prefix + supporterComment).slice(0, 500);
  }

  const scheduleContext = schedule ? {
    tomorrowYmd: schedule.tomorrowYmd,
    tomorrowHoliday: schedule.tomorrowHoliday.label,
    todayHoliday: schedule.todayHoliday.label,
    absenceToday: schedule.absenceToday,
    absenceTomorrow: schedule.absenceTomorrow,
  } : null;

  const accuracyDisplay = formatPredictionAccuracyDisplay(predictionFeedback);

  supporterComment = annotateCompareDatesInComment(supporterComment, today);

  const slotSnapshot = compactSlotFromResult({
    lockSlotHour: slot.slotHour,
    lockSlotLabel: slot.slotLabel,
    dataThroughYmd,
    topItems,
    bottomItems,
    supporterComment,
    keyFactors,
  });
  const mergedSlotHistory = mergeSlotHistory(slotHistory, slotSnapshot);

  const resultObj = {
    predictionDate,
    dataThroughYmd,
    dataThroughLabel: formatDataThroughLabel(dataThroughYmd),
    lockedForDate: today,
    lockVersion: PREDICTION_LOCK_VERSION,
    lockSlotHour: slot.slotHour,
    lockSlotLabel: slot.slotLabel,
    updateSchedule: PREDICTION_UPDATE_SCHEDULE_LABEL,
    posRefreshSchedule: PREDICTION_POS_REFRESH_LABEL,
    nextUpdateLabel: slot.nextSlotLabel,
    slotChangeSummary,
    slotHistory: mergedSlotHistory,
    dailyLocked: true,
    supporterComment,
    analysisSourcesLine,
    topItems,
    baseTopItems,
    bottomItems,
    activeContextLabels: contextLabels,
    keyFactors,
    scheduleContext,
    dataSourceStatus,
    activeVariables: activeVars.length,
    modelAccuracy: accuracyDisplay.modelAccuracy,
    accuracyLabel: accuracyDisplay.accuracyLabel,
    accuracyHint: accuracyDisplay.accuracyHint,
    backtestDays: accuracyDisplay.backtestDays,
    predictionAnalysisApplied: Boolean(predictionFeedback?.calibration.recentScores.length),
    noData: false,
    aiUsedStatisticalFallback,
    aiFailureReason,
    generatedAt: FieldValue.serverTimestamp(),
    ...(aiInfo || {}),
  };

  await cacheRef.set(resultObj).catch(()=>{});
  if (storeId && predictionFeedback) {
    savePredictionAnalysisDailyLog(storeId, today, predictionFeedback).catch(() => {});
  }
  const jsonBody = {
    ...resultObj,
    generatedAt: new Date().toISOString(),
  };
  const withToday = await enrichPredictionItemsWithTodayActual(storeId, today, {
    topItems: jsonBody.topItems as Array<Record<string, unknown>>,
    baseTopItems: jsonBody.baseTopItems as Array<Record<string, unknown>>,
    bottomItems: jsonBody.bottomItems as Array<Record<string, unknown>>,
  });
  return NextResponse.json({ ...jsonBody, ...withToday, cached: false });
}
