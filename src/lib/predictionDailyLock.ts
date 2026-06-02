/**
 * AI 매출 예측 — KST 갱신 슬롯 + 전일 23:59 마감 데이터
 * AI·품목 예측: 00:00 · 10:00 · 15:00 · 18:00 KST 각 1회
 * 당일 실매출(POS): 30분마다 (예상 vs 실제만, AI 없음)
 * 예측분석(사이드바): 전일 23:59 일마감까지 집계 (당일 00:00 마감 전 확정분)
 */

import { addDaysYMD, getKSTHour, getKSTTodayYMD, getKSTYesterdayYMD } from '@/lib/dateUtils';
import { isPlaceholderSupporterComment } from '@/lib/salesPredictionBuild';
import { hasValidSlotChangeSummary } from '@/lib/predictionSlotHistory';

/** KST 기준 대시보드 예측 갱신 시각 */
export const PREDICTION_UPDATE_SLOTS_KST = [0, 10, 15, 18] as const;

export type PredictionSlotHour = (typeof PREDICTION_UPDATE_SLOTS_KST)[number];

export const PREDICTION_LOCK_VERSION = 5;

/** 품목·매출 집계 마감 = 전일 (전일 23:59까지 확정, 당일 누적 제외) */
export function getPredictionDataThroughYmd(): string {
  return getKSTYesterdayYMD();
}

/** 예측분석 사이드바 기본 조회일 = 전일 마감 */
export function getSidebarAnalysisDefaultYmd(): string {
  return getKSTYesterdayYMD();
}

export function formatDataThroughLabel(ymd: string): string {
  return `${ymd} 23:59 마감`;
}

/** 현재 시각에 적용 중인 갱신 슬롯 (이미 지난 슬롯 중 가장 늦은 시각) */
export function getCurrentPredictionSlot(now = new Date()): {
  slotHour: PredictionSlotHour;
  slotLabel: string;
  nextSlotHour: PredictionSlotHour | null;
  nextSlotLabel: string | null;
} {
  const hour = getKSTHour(now);
  let slotHour: PredictionSlotHour = 0;
  for (const h of PREDICTION_UPDATE_SLOTS_KST) {
    if (hour >= h) slotHour = h;
  }
  const idx = PREDICTION_UPDATE_SLOTS_KST.indexOf(slotHour);
  const next = idx < PREDICTION_UPDATE_SLOTS_KST.length - 1
    ? PREDICTION_UPDATE_SLOTS_KST[idx + 1]
    : null;
  return {
    slotHour,
    slotLabel: formatSlotHour(slotHour),
    nextSlotHour: next,
    nextSlotLabel: next != null ? formatSlotHour(next) : null,
  };
}

export function formatSlotHour(h: number): string {
  if (h === 0) return '자정(00:00)';
  return `${String(h).padStart(2, '0')}:00`;
}

export function predictionCacheDocId(storeId: string, predictionDate = getKSTTodayYMD()): string {
  return `${predictionDate}_${storeId || 'global'}`;
}

export function isDailyPredictionCacheValid(
  cached: Record<string, unknown> | undefined,
  predictionDate = getKSTTodayYMD(),
  currentSlotHour = getCurrentPredictionSlot().slotHour,
): boolean {
  if (!cached || cached.noData) return false;
  if (String(cached.predictionDate || '') !== predictionDate) return false;
  if (Number(cached.lockVersion) < PREDICTION_LOCK_VERSION) return false;
  if (Number(cached.lockSlotHour) !== currentSlotHour) return false;

  const comment = String(cached.supporterComment || '');
  if (comment.length < 80 || isPlaceholderSupporterComment(comment)) return false;

  const topItems = cached.topItems;
  if (!Array.isArray(topItems) || topItems.length === 0) return false;
  const first = topItems[0] as { expectedSales?: number };
  if (!(Number(first?.expectedSales) > 0)) return false;

  if (!hasValidSlotChangeSummary(cached)) return false;

  return true;
}

export function nextPredictionLockYmd(predictionDate = getKSTTodayYMD()): string {
  return addDaysYMD(predictionDate, 1);
}

export const PREDICTION_UPDATE_SCHEDULE_LABEL =
  'AI·품목 예측: 00:00 · 10:00 · 15:00 · 18:00 (KST) · 당일 실매출: 30분마다';
