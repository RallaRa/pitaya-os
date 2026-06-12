export type ChecklistPhase = 'open' | 'close';

export interface ChecklistItemDef {
  id: string;
  label: string;
}

export const OPEN_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { id: '0', label: '냉장/냉동고 온도 확인' },
  { id: '1', label: '재고 현황 확인' },
  { id: '2', label: '저울 영점 조정' },
  { id: '3', label: '위생복 착용 확인' },
  { id: '4', label: '진열 상태 확인' },
  { id: '5', label: '키오스크 정상 동작' },
  { id: '6', label: 'POS 정상 동작' },
  { id: '7', label: '사이니지 정상 표시' },
];

export const CLOSE_CHECKLIST_ITEMS: ChecklistItemDef[] = [
  { id: '0', label: '재고 정리 및 냉장 보관' },
  { id: '1', label: '저울 청소' },
  { id: '2', label: '바닥/작업대 청소' },
  { id: '3', label: '쓰레기 처리' },
  { id: '4', label: 'POS 마감 완료' },
  { id: '5', label: '시건 장치 확인' },
  { id: '6', label: '당일 특이사항 기록' },
  { id: '7', label: '내일 발주 확인' },
];

export const PHASE_LABELS: Record<ChecklistPhase, string> = {
  open: '개점',
  close: '폐점',
};

export function getItemsForPhase(phase: ChecklistPhase): ChecklistItemDef[] {
  return phase === 'open' ? OPEN_CHECKLIST_ITEMS : CLOSE_CHECKLIST_ITEMS;
}

export interface ChecklistItemState {
  checked: boolean;
  note?: string;
}

export interface PhaseRecord {
  items: Record<string, ChecklistItemState>;
  assigneeName: string;
  notes: string;
  completedAt?: unknown;
  completedBy?: string;
  messengerSent?: boolean;
  incompleteAlertSent?: boolean;
}

export interface DailyChecklistDoc {
  storeId: string;
  checkDate: string;
  open?: PhaseRecord;
  close?: PhaseRecord;
}

export function countPhaseProgress(
  phase: ChecklistPhase,
  items: Record<string, ChecklistItemState> | undefined,
): { checked: number; total: number; complete: boolean; uncheckedLabels: string[] } {
  const defs = getItemsForPhase(phase);
  let checked = 0;
  const uncheckedLabels: string[] = [];
  for (const def of defs) {
    if (items?.[def.id]?.checked) checked++;
    else uncheckedLabels.push(def.label);
  }
  return {
    checked,
    total: defs.length,
    complete: checked === defs.length,
    uncheckedLabels,
  };
}

export function dailyChecklistDocId(storeId: string, checkDate: string): string {
  return `${storeId}_${checkDate}`.replace(/[/\\#?]/g, '_').slice(0, 500);
}

export function formatKstHm(date = new Date()): string {
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function emptyItemsForPhase(phase: ChecklistPhase): Record<string, ChecklistItemState> {
  const out: Record<string, ChecklistItemState> = {};
  for (const item of getItemsForPhase(phase)) {
    out[item.id] = { checked: false, note: '' };
  }
  return out;
}
