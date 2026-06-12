'use client';

import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, ChevronDown, ChevronUp, Target, HelpCircle } from 'lucide-react';
import WidgetWrapper from './WidgetWrapper';
import SalesEvidenceLine from './SalesEvidenceLine';
import { AiUsedBadge, type AiMetaDisplay } from '@/components/AiUsedBadge';
import EmptyState from '@/components/suspense/EmptyState';
import SkeletonCard from '@/components/suspense/SkeletonCard';
import { fetchAuthJson, useOrderDeliveryGap, useSalesPrediction } from '@/lib/queries';
import WidgetAnalysisPanel from './WidgetAnalysisPanel';
import { useWidgetAnalysis } from '@/hooks/useWidgetAnalysis';
import { isPlaceholderSupporterComment } from '@/lib/salesPredictionBuild';
import { annotateCompareDatesInComment } from '@/lib/annotateCompareDatesInText';
import { PREDICTION_POS_REFRESH_MS } from '@/lib/predictionRefreshConfig';
import { useNestedScrollChain } from '@/hooks/useNestedScrollChain';
import { useIsMobileView } from '@/hooks/useIsMobileView';

interface PredictionItem {
  rank: number; item: string; expectedSales: number;
  dailyAvgSales?: number;
  salesDays?: number;
  /** 예상 지표 단위 (기본 원) */
  salesUnit?: string;
  displayRecommend: string; changeVsLastWeek: number;
  confidence: number; badges: string[]; reasons: string[];
  reasonDetail: string;
  /** 당일 실매출 (POS·일마감) */
  todayActualSales?: number | null;
  vsPredictedDiff?: number | null;
  vsPredictedPct?: number | null;
}

function formatExpectedAmount(amount: number, unit?: string): string {
  const u = (unit || '원').trim();
  if (u === '원') return `${amount.toLocaleString('ko-KR')}원`;
  return `${amount.toLocaleString('ko-KR')}${u}`;
}

interface ScheduleContext {
  tomorrowYmd?: string;
  tomorrowHoliday?: string | null;
  todayHoliday?: string | null;
  absenceToday?: string[];
  absenceTomorrow?: string[];
}

interface PredictionData {
  predictionDate: string; supporterComment: string;
  dataThroughYmd?: string;
  dataThroughLabel?: string;
  lockSlotHour?: number;
  lockSlotLabel?: string;
  updateSchedule?: string;
  nextUpdateLabel?: string | null;
  /** 당일 직전 갱신 슬롯 대비 TOP5 변화 한 줄 (예: 10:00→15:00 TOP+목살) */
  slotChangeSummary?: string | null;
  dailyLocked?: boolean;
  /** 참조 조건 요약 (~100자) */
  analysisSourcesLine?: string;
  accuracyLabel?: string;
  accuracyHint?: string | null;
  backtestDays?: number;
  topItems: PredictionItem[];
  /** 평소 매출 기준 메인 진열 (상주 품목) */
  baseTopItems?: PredictionItem[];
  bottomItems: PredictionItem[];
  activeContextLabels?: string[];
  keyFactors: string[];
  scheduleContext?: ScheduleContext | null;
  dataSourceStatus: Record<string, string>;
  activeVariables: number; modelAccuracy: number;
  noData?: boolean; cached?: boolean;
  emptyReason?: string;
  aiFailureReason?: string | null;
  aiUsedStatisticalFallback?: boolean;
  generatedAt?: unknown;
  ai?: AiMetaDisplay;
  hasTodaySalesData?: boolean;
  todaySalesAsOf?: string;
  todayActualUpdatedAt?: string;
  posRefreshSchedule?: string;
}

/** API가 코멘트 앞에 붙인 [슬롯요약] 접두어 제거 — 위젯에서 별도 표시 */
function commentWithoutSlotPrefix(comment: string, summary: string | null | undefined): string {
  if (!summary?.trim()) return comment;
  const prefix = `[${summary.trim()}] `;
  return comment.startsWith(prefix) ? comment.slice(prefix.length) : comment;
}

function boldify(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={i} className="font-bold text-slate-100">{p.slice(2, -2)}</strong>
      : <span key={i}>{p}</span>,
  );
}

const PREDICTION_SECTION_TIPS = {
  spotlight:
    '평소 대비 오늘 더 팔릴 가능성이 큰 품목입니다. 어제·전주 동요일 판매 신호, 전주 추세, 날씨·공휴일·기념일을 합산한 상승 점수로 순위를 매깁니다. 오늘 진열 강화·추가 진열 후보입니다.',
  base:
    '평소 매출·발주 기준 메인에 상주하는 품목입니다. 90일 일평균과 요일별 실적으로 오늘 예상 매출 점수를 계산합니다. 오늘 주목 목록과 겹치지 않으며, 기본 진열을 유지할 상주 베스트셀러입니다.',
  bottom:
    '오늘 판매가 평소보다 줄어들 가능성이 큰 품목입니다. 상승 점수가 낮은 순으로 표시하며, 진열 축소·재고 조정 참고용입니다.',
} as const;

function PredictionSectionTitle({
  label,
  tip,
  className,
}: {
  label: string;
  tip: string;
  className: string;
}) {
  const anchorRef = useRef<HTMLSpanElement>(null);
  const [tipOpen, setTipOpen] = useState(false);
  const [tipPos, setTipPos] = useState({ left: 0, top: 0 });

  const showTip = useCallback(() => {
    const el = anchorRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const maxW = Math.min(300, window.innerWidth - 16);
    const left = Math.min(rect.left, window.innerWidth - maxW - 8);
    setTipPos({ left: Math.max(8, left), top: rect.bottom + 6 });
    setTipOpen(true);
  }, []);

  return (
    <>
      <span
        ref={anchorRef}
        role="button"
        tabIndex={0}
        className={`inline-flex items-center gap-1 cursor-help select-none ${className}`}
        onMouseEnter={showTip}
        onMouseLeave={() => setTipOpen(false)}
        onFocus={showTip}
        onBlur={() => setTipOpen(false)}
        aria-label={tip}
      >
        {label}
        <HelpCircle className="w-3 h-3 opacity-60 shrink-0" aria-hidden />
      </span>
      {tipOpen && typeof document !== 'undefined' && createPortal(
        <div
          role="tooltip"
          style={{ position: 'fixed', left: tipPos.left, top: tipPos.top, maxWidth: Math.min(300, window.innerWidth - 16), zIndex: 9999 }}
          className="rounded-lg border border-slate-600/70 bg-slate-800 px-2.5 py-2 text-[10px] leading-snug text-slate-200 shadow-xl pointer-events-none"
        >
          {tip}
        </div>,
        document.body,
      )}
    </>
  );
}

const REASON_MAX = 520;

/** 품목별 계산 근거 문장 (API reasonDetail + reasons, 없으면 수치로 조합) */
function buildItemReasonText(item: PredictionItem): string {
  const detail = (item.reasonDetail || '').trim();
  const reasons = (item.reasons || []).map(r => r.trim()).filter(Boolean);
  let text = detail;
  if (reasons.length) {
    const extra = reasons.filter(r => !detail.includes(r)).join(' · ');
    text = [detail, extra].filter(Boolean).join(' ');
  }
  if (!text) {
    const parts: string[] = [];
    if (item.expectedSales) parts.push(`예상 매출 ${formatExpectedAmount(item.expectedSales, item.salesUnit)}`);
    if (item.changeVsLastWeek !== 0) {
      parts.push(`전주 대비 ${item.changeVsLastWeek > 0 ? '+' : ''}${item.changeVsLastWeek}%`);
    }
    if (item.confidence) parts.push(`모델 신뢰도 ${item.confidence}%`);
    if (item.displayRecommend) parts.push(item.displayRecommend);
    text = parts.join('. ') || '90일 판매 이력·요일·날씨 변수를 반영한 추정입니다.';
  }
  return text.slice(0, REASON_MAX);
}

/** 우측: 예상(메인) · 실제·예측 차이(보조) */
function PredictionVsActualColumn({ item }: { item: PredictionItem }) {
  const predicted = item.dailyAvgSales ?? item.expectedSales ?? 0;
  const hasActual = item.todayActualSales != null;
  const actual = hasActual ? item.todayActualSales! : 0;
  const diff = hasActual
    ? (item.vsPredictedDiff ?? actual - predicted)
    : null;
  const pct = hasActual && diff != null
    ? (item.vsPredictedPct ?? (predicted > 0 ? Math.round((diff / predicted) * 100) : null))
    : null;
  const diffColor = diff != null && diff > 0 ? 'text-green-400' : diff != null && diff < 0 ? 'text-red-400' : 'text-slate-500';

  return (
    <div className="shrink-0 w-[100px] text-right pl-1">
      <p className="text-[9px] text-teal-500/80">예상</p>
      <p className="text-[11px] text-teal-300 font-semibold tabular-nums leading-tight">
        {predicted.toLocaleString('ko-KR')}원
      </p>
      {hasActual ? (
        <>
          <p className="text-[9px] text-slate-500 mt-0.5 tabular-nums">
            실제 {actual.toLocaleString('ko-KR')}원
          </p>
          <p className={`text-[9px] tabular-nums ${diffColor}`}>
            {diff === 0 ? '차이 ±0' : diff! > 0 ? `차이 +${diff!.toLocaleString('ko-KR')}` : `차이 ${diff!.toLocaleString('ko-KR')}`}
            {pct != null ? ` (${diff! > 0 ? '+' : ''}${pct}%)` : ''}
          </p>
        </>
      ) : (
        <p className="text-[9px] text-slate-600 mt-0.5">실제 집계중</p>
      )}
    </div>
  );
}

function ItemRow({
  item,
  variant,
  showTodayActual = false,
}: {
  item: PredictionItem;
  variant: 'top' | 'bottom';
  showTodayActual?: boolean;
}) {
  const dailyAvg = item.dailyAvgSales ?? item.expectedSales;
  const amountLabel = formatExpectedAmount(dailyAvg, item.salesUnit);
  const reasonText = useMemo(() => buildItemReasonText(item), [item]);
  const changeColor = item.changeVsLastWeek > 0 ? 'text-green-400' : item.changeVsLastWeek < 0 ? 'text-red-400' : 'text-slate-500';
  const reasonSummaryClass = variant === 'top'
    ? 'text-emerald-400/90 border-emerald-600/40 hover:bg-emerald-950/50'
    : 'text-rose-400/90 border-rose-600/40 hover:bg-rose-950/50';
  const reasonPanelClass = variant === 'top'
    ? 'bg-emerald-950/30 border-emerald-800/40 text-emerald-100/90'
    : 'bg-rose-950/30 border-rose-800/40 text-rose-100/90';

  return (
    <div className="flex items-start gap-2 py-2 border-b border-slate-800/60 last:border-0">
      <span className="text-[10px] font-bold text-slate-500 w-4 shrink-0 mt-0.5">{item.rank}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1 flex-wrap">
          <span className="text-xs text-slate-200 font-medium break-words">{item.item}</span>
          {item.badges?.map((b, i) => (
            <span key={i} className="text-[9px] bg-slate-700 text-slate-300 px-1 rounded shrink-0">{b}</span>
          ))}
        </div>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {!showTodayActual && (
            <span className="text-[10px] text-teal-400">예상 {amountLabel}</span>
          )}
          {item.changeVsLastWeek !== 0 && (
            <span className={`text-[10px] ${changeColor}`}>
              {item.changeVsLastWeek > 0 ? '+' : ''}{item.changeVsLastWeek}%
            </span>
          )}
          <span className="text-[10px] text-slate-600">신뢰도 {item.confidence}%</span>
        </div>
        {item.displayRecommend && (
          <p className="text-[10px] text-slate-500 mt-0.5 break-words">{item.displayRecommend}</p>
        )}
        <details className="mt-1.5 group/reason">
          <summary
            className={`inline-flex items-center gap-0.5 cursor-pointer select-none text-[9px] px-1.5 py-0.5 rounded border list-none transition-colors ${reasonSummaryClass} [&::-webkit-details-marker]:hidden`}
          >
            <HelpCircle className="w-2.5 h-2.5 shrink-0" />
            <span>근거</span>
            <ChevronDown className="w-2.5 h-2.5 shrink-0 group-open/reason:hidden" />
            <ChevronUp className="w-2.5 h-2.5 shrink-0 hidden group-open/reason:inline" />
          </summary>
          <div className={`mt-1.5 rounded-lg px-2 py-1.5 border text-[10px] leading-relaxed break-words ${reasonPanelClass}`}>
            <span className="font-semibold text-slate-400 block mb-0.5">계산 근거 (날짜·요일·휴일)</span>
            <span className="whitespace-pre-wrap">{reasonText}</span>
          </div>
        </details>
      </div>
      {showTodayActual && <PredictionVsActualColumn item={item} />}
    </div>
  );
}

export default function SalesPredictionWidget({
  editMode, onRemove, storeId, mobileLayout,
}: { editMode: boolean; onRemove: () => void; storeId?: string; mobileLayout?: boolean }) {
  if (!storeId) {
    return (
      <WidgetWrapper title="📈 AI 매출 예측 분석" editMode={editMode} onRemove={onRemove} autoHeight={mobileLayout}>
        <div className="p-3">
          <EmptyState reason="매장이 선택되지 않았습니다." />
        </div>
      </WidgetWrapper>
    );
  }

  return (
    <SalesPredictionWidgetContent
      editMode={editMode}
      onRemove={onRemove}
      storeId={storeId}
      mobileLayout={mobileLayout}
    />
  );
}

function SalesPredictionWidgetContent({
  editMode, onRemove, storeId, mobileLayout,
}: { editMode: boolean; onRemove: () => void; storeId: string; mobileLayout?: boolean }) {
  const { data: primaryRaw, isLoading, isError, refetch, dataUpdatedAt } = useSalesPrediction(storeId);
  const primaryData = primaryRaw as unknown as PredictionData | undefined;
  const { data: orderInfoRaw } = useOrderDeliveryGap(storeId);
  const orderInfo = orderInfoRaw as {
    dDayType?: string;
    gaps?: { start: string; end: string }[];
    holidayOrderAlert?: { message?: string; holidayDate?: string };
  } | undefined;
  const [data,       setData]       = useState<PredictionData | null>(primaryData ?? null);
  const [updatedAt,  setUpdatedAt]  = useState<Date | null>(new Date());
  const [showSource, setShowSource] = useState(false);
  const [posRefreshing, setPosRefreshing] = useState(false);
  const mqMobile = useIsMobileView();
  const isMobileView = mobileLayout ?? mqMobile;
  const widgetRootRef = useRef<HTMLDivElement>(null);
  const scrollBodyRef = useRef<HTMLDivElement>(null);
  const scrollOverflows = useNestedScrollChain(
    scrollBodyRef,
    widgetRootRef,
    !isMobileView,
  );

  const refreshTodayActual = useCallback(async () => {
    setPosRefreshing(true);
    try {
      const params = new URLSearchParams({ storeId });
      const patch = await fetchAuthJson<{
        error?: string;
        topItems?: PredictionItem[];
        baseTopItems?: PredictionItem[];
        bottomItems?: PredictionItem[];
        hasTodaySalesData?: boolean;
        todaySalesAsOf?: string;
        todayActualUpdatedAt?: string;
      }>(`/api/dashboard/sales-prediction/today-actual?${params}`);
      if (patch.error) return;
      setData(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          topItems: patch.topItems ?? prev.topItems,
          baseTopItems: patch.baseTopItems ?? prev.baseTopItems,
          bottomItems: patch.bottomItems ?? prev.bottomItems,
          hasTodaySalesData: patch.hasTodaySalesData ?? prev.hasTodaySalesData,
          todaySalesAsOf: patch.todaySalesAsOf ?? prev.todaySalesAsOf,
          todayActualUpdatedAt: patch.todayActualUpdatedAt,
        };
      });
    } catch { /* ignore */ }
    finally {
      setPosRefreshing(false);
    }
  }, [storeId]);

  useEffect(() => {
    if (primaryData) setData(primaryData);
  }, [primaryData]);

  useEffect(() => {
    if (dataUpdatedAt) setUpdatedAt(new Date(dataUpdatedAt));
  }, [dataUpdatedAt]);

  const refresh = useCallback(() => {
    void refetch();
  }, [refetch]);
  const analysis = useWidgetAnalysis('sales_prediction', storeId, data ? {
    modelAccuracy: data.modelAccuracy,
    keyFactors: data.keyFactors,
    accuracyLabel: data.accuracyLabel,
    topItems: data.topItems,
  } : undefined);

  useEffect(() => {
    if (!data?.topItems?.length || !storeId) return;
    refreshTodayActual();
    const id = window.setInterval(() => { refreshTodayActual(); }, PREDICTION_POS_REFRESH_MS);
    return () => window.clearInterval(id);
  }, [data?.topItems?.length, data?.predictionDate, data?.lockSlotHour, storeId, refreshTodayActual]);

  const dDayType = orderInfo?.dDayType;
  const dDayBanner = dDayType ? {
    'D-2':    { bg: 'bg-amber-900/30 border-amber-500/40', text: 'text-amber-300', msg: '📦 발주 마감 D-2 — 발주 준비를 시작하세요' },
    'D-1':    { bg: 'bg-orange-900/30 border-orange-500/40', text: 'text-orange-300', msg: '📦 발주 마감 D-1 ⚠️ — 오늘 중 발주하세요!' },
    '당일':   { bg: 'bg-red-900/30 border-red-500/40', text: 'text-red-300 font-bold', msg: '🚨 오늘이 발주 마감일입니다!' },
    '휴일발주알림': {
      bg: 'bg-red-900/40 border-red-500/50',
      text: 'text-red-200 font-bold animate-pulse',
      msg: orderInfo?.holidayOrderAlert?.message
        || '📅 모레 휴일입니다. 오늘 발주 시 내일 수령 가능 — 발주 추가점검해주세요.',
    },
  }[dDayType] : null;

  const hasValidComment = Boolean(data?.supporterComment?.trim()) && !isPlaceholderSupporterComment(data?.supporterComment || '');
  const showEmptyReason = data?.noData || (!hasValidComment && !(data?.topItems?.length));
  const showAiFailure = !!(data?.aiFailureReason && !data?.noData);
  const showStaleCommentHint = Boolean(
    data?.supporterComment && isPlaceholderSupporterComment(data.supporterComment) && (data?.topItems?.length),
  );
  const slotChangeSummary = data?.slotChangeSummary?.trim() || null;
  const displayComment = useMemo(() => {
    if (!data?.supporterComment) return '';
    const raw = commentWithoutSlotPrefix(data.supporterComment, slotChangeSummary);
    const baseYmd = data.predictionDate || new Date().toISOString().slice(0, 10);
    return annotateCompareDatesInComment(raw, baseYmd);
  }, [data?.supporterComment, data?.predictionDate, slotChangeSummary]);

  if (isLoading && !data) {
    return (
      <WidgetWrapper title="📈 AI 매출 예측 분석" editMode={editMode} onRemove={onRemove} autoHeight={isMobileView}>
        <div className="p-3"><SkeletonCard /></div>
      </WidgetWrapper>
    );
  }

  if (isError && !data) {
    return (
      <WidgetWrapper title="📈 AI 매출 예측 분석" editMode={editMode} onRemove={onRemove} onRefresh={refresh} autoHeight={isMobileView}>
        <div className="p-3"><EmptyState reason="매출 예측 데이터를 불러오지 못했습니다." /></div>
      </WidgetWrapper>
    );
  }

  return (
    <WidgetWrapper
      title="📈 AI 매출 예측 분석"
      editMode={editMode}
      onRemove={onRemove}
      updatedAt={updatedAt}
      onRefresh={refresh}
      autoHeight={isMobileView}
      rootRef={widgetRootRef}
    >
      <div
        className={`flex flex-col text-xs ${
          isMobileView ? '' : 'h-full min-h-0 overflow-hidden'
        }`}
      >

        <div className="shrink-0 mx-2 mt-1 mb-1 flex items-start gap-1.5 bg-amber-950/40 border border-amber-500/30 rounded-lg px-2.5 py-1.5">
          <AlertTriangle className="w-3 h-3 text-amber-400 shrink-0 mt-0.5" />
          <p className="text-amber-300/80 text-[10px] leading-tight">
            AI 예측은 참조 수단입니다. 관리자의 실제 경험에 도움을 주는 참고 자료로 활용하세요.
            {(data?.dataThroughLabel || data?.dataThroughYmd) && (
              <span className="block mt-0.5 text-amber-400/70">
                데이터 {data.dataThroughLabel || `${data.dataThroughYmd} 23:59 마감`}
                {data.lockSlotLabel ? ` · 갱신 ${data.lockSlotLabel} 구간` : ''}
                {data.dailyLocked ? ' 고정' : ''}
                {data.nextUpdateLabel ? ` · 다음 ${data.nextUpdateLabel}` : ''}
              </span>
            )}
            {data?.updateSchedule && (
              <span className="block text-amber-500/60 text-[9px]">{data.updateSchedule}</span>
            )}
            {data?.posRefreshSchedule && (
              <span className="block text-amber-500/60 text-[9px]">{data.posRefreshSchedule}</span>
            )}
            {posRefreshing && (
              <span className="block text-teal-500/70 text-[9px]">당일 실매출 갱신 중…</span>
            )}
          </p>
        </div>

        {data?.scheduleContext?.tomorrowHoliday && (
          <div className="shrink-0 mx-2 mb-2 flex items-start gap-1.5 bg-purple-950/50 border border-purple-500/35 rounded-lg px-2.5 py-1.5">
            <Target className="w-3 h-3 text-purple-400 shrink-0 mt-0.5" />
            <p className="text-purple-200/90 text-[10px] leading-tight">
              내일({data.scheduleContext.tomorrowYmd}) <strong>{data.scheduleContext.tomorrowHoliday}</strong>
              — 매출·유동·발주에 반영하세요.
              {data.scheduleContext.absenceTomorrow?.length
                ? ` 결원: ${data.scheduleContext.absenceTomorrow.join(', ')}`
                : ''}
            </p>
          </div>
        )}

        {dDayBanner && (
          <div className={`shrink-0 mx-2 mb-2 border rounded-lg px-2.5 py-1.5 ${dDayBanner.bg}`}>
            <p className={`text-[10px] ${dDayBanner.text}`}>{dDayBanner.msg}</p>
          </div>
        )}

        <div
          ref={scrollBodyRef}
          className={
            isMobileView
              ? 'flex flex-col touch-pan-y'
              : `flex-1 min-h-0 overflow-x-hidden touch-pan-y overscroll-y-auto ${
                  scrollOverflows ? 'overflow-y-auto' : 'overflow-y-visible'
                }`
          }
        >
        {showEmptyReason && data?.emptyReason && (
          <EmptyState
            reason={data.emptyReason}
            hints={['POS 브릿지 실행 여부 확인', '일마감에 품목(items) 저장 여부 확인', 'AI 키는 .env.local 확인']}
            className="mx-2 mb-2"
          />
        )}

        {showStaleCommentHint && (
          <EmptyState
            reason="이전 형식의 예측이 저장되어 있습니다. 내일 0시 이후 자동으로 새 예측이 생성됩니다."
            hints={['긴급 시 관리자에게 배포 후 캐시 초기화 요청', 'POS·전일 일마감 데이터 확인']}
            className="mx-2 mb-2"
          />
        )}

        {showAiFailure && (
          <EmptyState
            reason={data!.aiFailureReason!}
            hints={[
              '대시보드 새로고침으로 AI를 다시 순차 시도',
              'Vercel 환경변수: GEMINI_API_KEY, ANTHROPIC_API_KEY, OPENAI_API_KEY, GROQ_API_KEY',
              data?.aiUsedStatisticalFallback ? '품목 수치는 판매 이력 통계로 표시 중' : '',
            ].filter(Boolean)}
            className="mx-2 mb-2"
          />
        )}

        {!data?.noData && slotChangeSummary && (
          <div className="mx-2 mb-2 flex items-start gap-1.5 bg-slate-800/60 border border-slate-600/50 rounded-lg px-2.5 py-1.5 shrink-0">
            <span className="text-[10px] text-slate-400 shrink-0 mt-px">📊</span>
            <div className="min-w-0">
              <p className="text-[10px] text-slate-400 font-medium">직전 갱신 대비 TOP 변화</p>
              <p className="text-[11px] text-slate-200/95 leading-snug break-words">{slotChangeSummary}</p>
            </div>
          </div>
        )}

        {hasValidComment && (
          <div className="mx-2 mb-2 bg-blue-950/40 border border-blue-500/25 rounded-xl px-3 py-3 shrink-0">
            <p className="text-[10px] text-blue-400/90 font-semibold mb-1.5">🤖 AI 종합 분석</p>
            <p className="text-[12px] sm:text-[13px] text-blue-100/95 leading-relaxed whitespace-pre-wrap break-words">
              {boldify(displayComment)}
            </p>
            {data.analysisSourcesLine && (
              <SalesEvidenceLine
                summary={data.analysisSourcesLine}
                detail="당일 예측은 90일 평균·전주·전월·전년 동요일·날씨·휴일·네이버 트렌드·축산가 등 다기준 가중으로 산출합니다. 품목별 근거는 목록에서 펼치기."
                className="mt-2 border-t border-slate-700/50 pt-2"
                compact
              />
            )}
            <p className="text-[9px] text-slate-600 mt-1.5">
              {displayComment.length}자 · {data.aiUsedStatisticalFallback ? '다기준 통계·외부 API' : 'AI·다기준 데이터'} · 참고용
            </p>
            <AiUsedBadge ai={data.ai} className="mt-2" />
          </div>
        )}

        {data && !data.noData ? (
          <div className="flex flex-col gap-3 px-2">
            {data.activeContextLabels && data.activeContextLabels.length > 0 && (
              <p className="text-[10px] text-amber-400/90 px-1 leading-snug">
                오늘 반영: {data.activeContextLabels.join(' · ')}
              </p>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold mb-0.5 py-0.5 sticky top-0 bg-slate-900/95 z-[1]">
                <PredictionSectionTitle
                  label="✨ 오늘 주목 TOP10"
                  tip={PREDICTION_SECTION_TIPS.spotlight}
                  className="text-emerald-400"
                />
              </p>
              <p className="text-[9px] text-slate-500 mb-1 px-0.5 flex justify-between gap-2">
                <span>평소 대비 상승·날씨·공휴일·기념일</span>
                {data.hasTodaySalesData && (
                  <span className="text-slate-600 shrink-0">우측: 예상·실제차</span>
                )}
              </p>
              <div className="rounded-lg bg-slate-800/30 px-2 border border-emerald-900/40">
                {(data?.topItems || []).length === 0 ? (
                  <p className="text-slate-600 text-[10px] py-2">품목 예측 없음</p>
                ) : (
                  (data?.topItems || []).map(item => (
                    <ItemRow key={`t-${item.rank}`} item={item} variant="top" showTodayActual />
                  ))
                )}
              </div>
            </div>
            {(data?.baseTopItems || []).length > 0 && (
              <div className="min-w-0">
                <p className="text-[10px] font-semibold mb-0.5 py-0.5 sticky top-0 bg-slate-900/95 z-[1]">
                  <PredictionSectionTitle
                    label="📈 기본 메인 진열 TOP10"
                    tip={PREDICTION_SECTION_TIPS.base}
                    className="text-green-400/80"
                  />
                </p>
                <p className="text-[9px] text-slate-500 mb-1 px-0.5">평소 매출·발주 기준 상주 품목 · 우측 예상·실제차</p>
                <div className="rounded-lg bg-slate-800/20 px-2">
                  {data.baseTopItems!.map(item => (
                    <ItemRow key={`b-${item.rank}`} item={item} variant="bottom" showTodayActual />
                  ))}
                </div>
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[10px] font-semibold mb-1 py-0.5 sticky top-0 bg-slate-900/95 z-[1]">
                <PredictionSectionTitle
                  label="📉 오늘 감소·축소 예상"
                  tip={PREDICTION_SECTION_TIPS.bottom}
                  className="text-red-400"
                />
              </p>
              <div className="rounded-lg bg-slate-800/30 px-2">
                {(data?.bottomItems || []).length === 0 ? (
                  <p className="text-slate-600 text-[10px] py-2">품목 예측 없음</p>
                ) : (
                  (data?.bottomItems || []).map(item => <ItemRow key={`b-${item.rank}`} item={item} variant="bottom" />)
                )}
              </div>
            </div>
          </div>
        ) : null}

        {data && !data.noData && (
          <div className="px-2 pt-2 mt-1 border-t border-slate-800/60 shrink-0">
            {data.keyFactors && data.keyFactors.length > 0 && (
              <div className="mb-2 flex flex-wrap gap-1">
                {data.keyFactors.slice(0, 5).map((f, i) => (
                  <span key={i} className="text-[9px] px-1.5 py-0.5 rounded bg-slate-800/60 text-slate-400 border border-slate-700/50">
                    {f}
                  </span>
                ))}
              </div>
            )}
            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => setShowSource(v => !v)}
                className="flex items-center gap-1 text-[10px] text-slate-500 hover:text-slate-300 transition-colors"
              >
                {showSource ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                근거 데이터 펼치기
              </button>
              <span className="ml-auto flex flex-col items-end text-[10px] text-teal-400 max-w-[45%]">
                <span className="flex items-center gap-1">
                  <Target className="w-3 h-3 shrink-0" />
                  {data.accuracyLabel || '예측 적중률'}
                  {data.modelAccuracy != null ? ` ${Math.round(data.modelAccuracy)}%` : ' —'}
                </span>
                {data.accuracyHint && (
                  <span className="text-[9px] text-slate-500 text-right mt-0.5 leading-tight">{data.accuracyHint}</span>
                )}
              </span>
            </div>
            {showSource && (
              <div className="mt-1.5 bg-slate-800/40 rounded-lg p-2 grid grid-cols-2 gap-x-3 gap-y-0.5">
                {Object.entries(data.dataSourceStatus || {}).map(([k, v]) => (
                  <div key={k} className="flex items-center gap-1 text-[10px]">
                    <span>{v as string}</span>
                    <span className="text-slate-500 break-all">{k}</span>
                  </div>
                ))}
                <div className="col-span-2 text-[9px] text-slate-600 mt-1">
                  활성 날씨변수 {data.activeVariables}개
                </div>
              </div>
            )}
            <WidgetAnalysisPanel analysis={analysis} />
          </div>
        )}
        </div>
      </div>
    </WidgetWrapper>
  );
}
