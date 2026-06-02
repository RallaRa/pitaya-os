import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { countLeaveDaysUsed } from '@/lib/hr/annualLeave';
import { computeLeaveRemain, leaveRemainFields } from '@/lib/hr/leaveRemainDisplay';

function leaveBalanceUpdate(total: number, used: number, extra: Record<string, unknown> = {}) {
  return {
    ...extra,
    ...leaveRemainFields(total, used),
    usedAnnualLeave: used,
    updatedAt: new Date().toISOString(),
  };
}

export async function findEmployeeByUserId(storeId: string, userId: string) {
  const snap = await adminDb.collection('hr_employees')
    .where('storeId', '==', storeId)
    .where('linkedUid', '==', userId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0];
}

export interface LeaveBalanceSnapshot {
  ok: boolean;
  error?: string;
  used?: number;
  total?: number;
  remain?: number;
  overused?: boolean;
  daysUsed?: number;
}

/** 승인된 연차 신청 합계로 usedAnnualLeave 재계산 (수정·삭제 후 동기화용) */
export async function recalculateUsedLeave(
  storeId: string,
  userId: string,
): Promise<LeaveBalanceSnapshot> {
  const empDoc = await findEmployeeByUserId(storeId, userId);
  if (!empDoc) {
    return { ok: false, error: '연결된 사원 정보를 찾을 수 없습니다' };
  }

  const emp = empDoc.data();
  const daysOff: string[] = emp.daysOff || ['토', '일'];

  const snap = await adminDb.collection('hr_leave_requests')
    .where('storeId', '==', storeId)
    .where('userId', '==', userId)
    .where('status', '==', 'approved')
    .limit(500)
    .get();

  let used = 0;
  snap.docs.forEach(doc => {
    const d = doc.data();
    if (d.type === 'unpaid') return;
    used += countLeaveDaysUsed(d.startDate, d.endDate, d.type, daysOff);
  });

  const total = Number(emp.totalAnnualLeave ?? 0);
  const remain = computeLeaveRemain(total, used);

  await empDoc.ref.update(leaveBalanceUpdate(total, used));

  return { ok: true, used, total, remain, overused: remain < 0 };
}

/** 승인 시 차감 — 초과 사용 허용 (allowOveruse 기본 true) */
export async function deductLeaveBalance(
  storeId: string,
  userId: string,
  leaveType: string,
  startDate: string,
  endDate: string,
  options: { allowOveruse?: boolean } = {},
): Promise<LeaveBalanceSnapshot> {
  const allowOveruse = options.allowOveruse !== false;
  const empDoc = await findEmployeeByUserId(storeId, userId);
  if (!empDoc) {
    return { ok: false, error: '연결된 사원 정보를 찾을 수 없습니다' };
  }

  const emp = empDoc.data();
  const daysOff: string[] = emp.daysOff || ['토', '일'];
  const daysUsed = countLeaveDaysUsed(startDate, endDate, leaveType, daysOff);

  if (daysUsed <= 0) return { ok: true, daysUsed: 0, used: emp.usedAnnualLeave, total: emp.totalAnnualLeave };

  const total = Number(emp.totalAnnualLeave ?? 0);
  const used = Number(emp.usedAnnualLeave ?? 0);
  const beforeRemain = computeLeaveRemain(total, used);

  if (!allowOveruse && daysUsed > beforeRemain) {
    return {
      ok: false,
      error: `잔여 연차 부족 (잔여 ${beforeRemain}일, 신청 ${daysUsed}일)`,
      used,
      total,
      remain: beforeRemain,
    };
  }

  const newUsed = used + daysUsed;
  const remain = computeLeaveRemain(total, newUsed);
  await empDoc.ref.update(leaveBalanceUpdate(total, newUsed));

  return {
    ok: true,
    daysUsed,
    used: newUsed,
    total,
    remain,
    overused: remain < 0,
  };
}

export async function restoreLeaveBalance(
  storeId: string,
  userId: string,
  leaveType: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  const empDoc = await findEmployeeByUserId(storeId, userId);
  if (!empDoc) return;

  const emp = empDoc.data();
  const daysOff: string[] = emp.daysOff || ['토', '일'];
  const daysUsed = countLeaveDaysUsed(startDate, endDate, leaveType, daysOff);
  if (daysUsed <= 0) return;

  const total = Number(emp.totalAnnualLeave ?? 0);
  const used = Math.max(0, Number(emp.usedAnnualLeave ?? 0) - daysUsed);
  await empDoc.ref.update(leaveBalanceUpdate(total, used));
}

/** 관리자 수동 조정 (총/사용 연차) */
export async function adjustLeaveBalance(
  storeId: string,
  userId: string,
  patch: { totalAnnualLeave?: number; usedAnnualLeave?: number },
): Promise<LeaveBalanceSnapshot> {
  const empDoc = await findEmployeeByUserId(storeId, userId);
  if (!empDoc) return { ok: false, error: '연결된 사원 정보를 찾을 수 없습니다' };

  const emp = empDoc.data();
  const total = Number(patch.totalAnnualLeave ?? emp.totalAnnualLeave ?? 0);
  const used = Number(patch.usedAnnualLeave ?? emp.usedAnnualLeave ?? 0);
  const remain = computeLeaveRemain(total, used);

  await empDoc.ref.update({
    ...(patch.totalAnnualLeave !== undefined ? { totalAnnualLeave: total } : {}),
    ...leaveBalanceUpdate(total, used),
  });

  return { ok: true, total, used, remain, overused: remain < 0 };
}

export async function logLeaveGrant(
  storeId: string,
  empNo: string,
  name: string,
  grant: {
    totalAnnualLeave: number;
    previousTotal: number;
    usedAnnualLeave: number;
    leaveYearNumber: number;
    rule: string;
    generatedBy: string;
  },
) {
  await adminDb.collection('hr_annual_leave_grants').add({
    storeId,
    empNo,
    name,
    ...grant,
    createdAt: FieldValue.serverTimestamp(),
  });
}
