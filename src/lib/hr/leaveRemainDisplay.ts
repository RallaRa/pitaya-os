/** 연차 잔여 = 총 − 사용 (음수 = 다음 달 선사용) */
export function computeLeaveRemain(total: number, used: number): number {
  return Number(total) - Number(used);
}

export function isLeavePreused(remain: number): boolean {
  return remain < 0;
}

/** Firestore 동기화용 */
export function leaveRemainFields(total: number, used: number) {
  const remain = computeLeaveRemain(total, used);
  return {
    remainAnnualLeave: remain,
    leavePreusedDays: remain < 0 ? Math.abs(remain) : 0,
  };
}

export function leaveRemainClass(remain: number): string {
  if (remain < 0) return 'text-red-400 font-semibold';
  if (remain === 0) return 'text-yellow-400';
  return 'text-teal-400';
}

/** 예: "-1일 (선사용)" / "3일" */
export function formatLeaveRemainLabel(remain: number, withUnit = true): string {
  const unit = withUnit ? '일' : '';
  const base = `${remain}${unit}`;
  return remain < 0 ? `${base} (선사용)` : base;
}
