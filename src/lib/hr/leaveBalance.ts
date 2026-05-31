import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { countLeaveDaysUsed } from '@/lib/hr/annualLeave';

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
  const remain = total - used;

  await empDoc.ref.update({
    usedAnnualLeave: used,
    updatedAt: new Date().toISOString(),
  });

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
  const remain = total - used;

  if (!allowOveruse && daysUsed > remain) {
    return {
      ok: false,
      error: `잔여 연차 부족 (잔여 ${remain}일, 신청 ${daysUsed}일)`,
      used,
      total,
      remain,
    };
  }

  const newUsed = used + daysUsed;
  await empDoc.ref.update({
    usedAnnualLeave: newUsed,
    updatedAt: new Date().toISOString(),
  });

  return {
    ok: true,
    daysUsed,
    used: newUsed,
    total,
    remain: total - newUsed,
    overused: newUsed > total,
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

  const used = Number(emp.usedAnnualLeave ?? 0);
  await empDoc.ref.update({
    usedAnnualLeave: Math.max(0, used - daysUsed),
    updatedAt: new Date().toISOString(),
  });
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
  const updates: Record<string, unknown> = { updatedAt: new Date().toISOString() };

  if (patch.totalAnnualLeave !== undefined) {
    updates.totalAnnualLeave = Number(patch.totalAnnualLeave);
  }
  if (patch.usedAnnualLeave !== undefined) {
    updates.usedAnnualLeave = Number(patch.usedAnnualLeave);
  }

  await empDoc.ref.update(updates);

  const total = Number(updates.totalAnnualLeave ?? emp.totalAnnualLeave ?? 0);
  const used = Number(updates.usedAnnualLeave ?? emp.usedAnnualLeave ?? 0);
  const remain = total - used;

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
