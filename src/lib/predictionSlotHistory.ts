/**
 * 당일 시간대별 예측 이력 — 다음 갱신 시 변화·영향 반영
 * 참조 범위: 전일 23:59 마감 데이터 + 당일 이전 슬롯 예측만 (타일·전일 슬롯 제외)
 */

import { addDaysYMD } from '@/lib/dateUtils';
import {
  PREDICTION_UPDATE_SLOTS_KST,
  formatSlotHour,
  type PredictionSlotHour,
} from '@/lib/predictionDailyLock';
import { itemNamesMatch } from '@/lib/itemNameMatch';

export interface PredictionSlotSnapshot {
  slotHour: number;
  slotLabel: string;
  dataThroughYmd: string;
  topItems: Array<{ rank: number; item: string; expectedSales: number }>;
  bottomItems: Array<{ rank: number; item: string; expectedSales: number }>;
  supporterComment: string;
  keyFactors: string[];
}

export type SlotHistoryMap = Record<string, PredictionSlotSnapshot>;

function compactItems(items: unknown[]): PredictionSlotSnapshot['topItems'] {
  return (items || []).slice(0, 10).map((raw, i) => {
    const it = raw as Record<string, unknown>;
    return {
      rank: Number(it.rank) || i + 1,
      item: String(it.item || '').trim(),
      expectedSales: Number(it.dailyAvgSales ?? it.expectedSales) || 0,
    };
  }).filter(x => x.item);
}

export function compactSlotFromResult(result: {
  lockSlotHour?: number;
  lockSlotLabel?: string;
  dataThroughYmd?: string;
  topItems?: unknown[];
  bottomItems?: unknown[];
  supporterComment?: string;
  keyFactors?: unknown[];
}): PredictionSlotSnapshot {
  const hour = Number(result.lockSlotHour) || 0;
  return {
    slotHour: hour,
    slotLabel: String(result.lockSlotLabel || formatSlotHour(hour)),
    dataThroughYmd: String(result.dataThroughYmd || ''),
    topItems: compactItems(result.topItems || []),
    bottomItems: compactItems(result.bottomItems || []),
    supporterComment: String(result.supporterComment || '').slice(0, 500),
    keyFactors: Array.isArray(result.keyFactors)
      ? result.keyFactors.map(String).slice(0, 8)
      : [],
  };
}

/** 당일·현재 슬롯 이전 기록만 (전일/과거 일자 슬롯 제외) */
export function getPriorSlotsToday(
  slotHistory: SlotHistoryMap | undefined,
  currentSlotHour: number,
  predictionDate: string,
): PredictionSlotSnapshot[] {
  if (!slotHistory) return [];
  return PREDICTION_UPDATE_SLOTS_KST
    .filter(h => h < currentSlotHour)
    .map(h => slotHistory[String(h)])
    .filter((s): s is PredictionSlotSnapshot => {
      if (!s) return false;
      if (s.dataThroughYmd && s.dataThroughYmd !== getDataThroughForPredictionDate(predictionDate)) {
        return false;
      }
      return true;
    });
}

function getDataThroughForPredictionDate(predictionDate: string): string {
  return addDaysYMD(predictionDate, -1);
}

function topNames(snap: PredictionSlotSnapshot, n = 5): string[] {
  return snap.topItems.slice(0, n).map(t => t.item);
}

function diffTopLists(prev: string[], curr: string[]): {
  added: string[];
  removed: string[];
  kept: string[];
} {
  const kept = curr.filter(c => prev.some(p => itemNamesMatch(p, c)));
  const added = curr.filter(c => !prev.some(p => itemNamesMatch(p, c)));
  const removed = prev.filter(p => !curr.some(c => itemNamesMatch(c, p)));
  return { added, removed, kept };
}

function formatTopLine(snap: PredictionSlotSnapshot): string {
  return snap.topItems
    .slice(0, 5)
    .map(t => `${t.item} ${t.expectedSales.toLocaleString()}원`)
    .join(', ');
}

/** AI·종합 코멘트용 — 당일 이전 슬롯 대비 변화 */
export function buildSlotChangeContext(opts: {
  predictionDate: string;
  dataThroughYmd: string;
  currentSlotHour: PredictionSlotHour;
  currentSlotLabel: string;
  priorSlots: PredictionSlotSnapshot[];
  currentTop: PredictionSlotSnapshot['topItems'];
  keyFactors?: string[];
}): string {
  const { predictionDate, dataThroughYmd, currentSlotHour, currentSlotLabel, priorSlots, currentTop, keyFactors } = opts;

  if (priorSlots.length === 0) {
    return [
      `[당일 첫 갱신 ${currentSlotLabel}]`,
      `데이터는 전일 ${dataThroughYmd} 23:59 마감만 사용(당일 POS 미반영).`,
      `이전 시간대 예측 없음 — 전일 마감·오늘 일정·날씨·뉴스 중심으로 작성.`,
    ].join('\n');
  }

  const lines: string[] = [
    `[당일 시간대 예측 이력 — ${predictionDate}만 참조, 데이터는 전일 ${dataThroughYmd} 23:59 마감 동일]`,
    `지금 ${currentSlotLabel} 구간 예측 생성. 아래 당일 이전 갱신과 비교해 무엇이·왜 달라졌는지 반드시 서술.`,
  ];

  priorSlots.forEach(snap => {
    lines.push(`· ${snap.slotLabel}: TOP5 ${formatTopLine(snap)}`);
    if (snap.keyFactors?.length) {
      lines.push(`  요인: ${snap.keyFactors.slice(0, 4).join(', ')}`);
    }
  });

  const lastPrior = priorSlots[priorSlots.length - 1];
  const currNames = currentTop.slice(0, 5).map(t => t.item);
  const prevNames = topNames(lastPrior, 5);
  const { added, removed, kept } = diffTopLists(prevNames, currNames);

  lines.push(`· 직전(${lastPrior.slotLabel})→현재(${currentSlotLabel}) TOP 변화:`);
  if (added.length) lines.push(`  신규: ${added.join(', ')}`);
  if (removed.length) lines.push(`  제외: ${removed.join(', ')}`);
  if (kept.length) {
    const amountShifts: string[] = [];
    kept.forEach(name => {
      const p = lastPrior.topItems.find(t => itemNamesMatch(t.item, name));
      const c = currentTop.find(t => itemNamesMatch(t.item, name));
      if (p && c && p.expectedSales !== c.expectedSales) {
        const d = c.expectedSales - p.expectedSales;
        amountShifts.push(`${name} ${d > 0 ? '+' : ''}${d.toLocaleString()}원`);
      }
    });
    if (amountShifts.length) lines.push(`  유지 품목 일평균 변동: ${amountShifts.join(', ')}`);
  }

  if (keyFactors?.length) {
    const prevK = new Set(lastPrior.keyFactors || []);
    const newK = keyFactors.filter(k => !prevK.has(k));
    if (newK.length) lines.push(`· 새 변수(직전 대비): ${newK.join(', ')}`);
  }

  lines.push(
    '종합 코멘트에 ①직전 갱신 대비 TOP·요인 변화 ②변화 원인(날씨·공휴일·뉴스·트렌드) ③오늘·내일 실행을 포함.',
  );

  return lines.join('\n').slice(0, 1200);
}

export function mergeSlotHistory(
  existing: SlotHistoryMap | undefined,
  snapshot: PredictionSlotSnapshot,
): SlotHistoryMap {
  return {
    ...(existing || {}),
    [String(snapshot.slotHour)]: snapshot,
  };
}

/** 위젯·캐시용 — 항상 비어 있지 않은 한 줄 요약 */
export function buildSlotChangeSummaryShort(
  priorSlots: PredictionSlotSnapshot[],
  currentTop: PredictionSlotSnapshot['topItems'],
  currentSlotLabel: string,
  dataThroughYmd?: string,
): string {
  if (priorSlots.length === 0) {
    const through = dataThroughYmd ? ` · 전일 ${dataThroughYmd} 마감` : '';
    return `${currentSlotLabel} · 당일 첫 갱신${through}`;
  }
  const last = priorSlots[priorSlots.length - 1];
  const { added, removed } = diffTopLists(topNames(last, 5), currentTop.slice(0, 5).map(t => t.item));
  const parts: string[] = [`${last.slotLabel}→${currentSlotLabel}`];
  if (added.length) parts.push(`TOP+${added.join(',')}`);
  if (removed.length) parts.push(`TOP-${removed.join(',')}`);
  else if (!added.length && !removed.length) parts.push('TOP 동일');
  return parts.join(' ');
}

export function hasValidSlotChangeSummary(cached: Record<string, unknown> | undefined): boolean {
  return Boolean(String(cached?.slotChangeSummary || '').trim());
}
