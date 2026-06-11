import { adminDb } from '@/lib/firebase/admin';
import {
  calculatePayrollRun,
  countWorkDaysInMonth,
  mergePayrollSettings,
  type EmployeePayrollInput,
  type AttendanceSummary,
} from '@/lib/hr-system/payrollCalculator';
import { leaveRequestOverlapsMonth } from '@/lib/hr/storeAdmin';
import type { PayrollRun, PayrollSettings, PayrollSlip } from '@/lib/hr-system/types';

export async function loadPayrollSettings(storeId: string): Promise<PayrollSettings> {
  const snap = await adminDb.collection('hr_payroll_settings').doc(storeId).get();
  return mergePayrollSettings(storeId, snap.exists ? (snap.data() as PayrollSettings) : null);
}

export async function loadActiveEmployees(storeId: string) {
  const snap = await adminDb.collection('hr_employees')
    .where('storeId', '==', storeId)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

async function loadAttendanceForMonth(storeId: string, period: string) {
  const [y, m] = period.split('-').map(Number);
  const daysInMonth = new Date(y, m, 0).getDate();
  const start = `${period}-01`;
  const end = `${period}-${String(daysInMonth).padStart(2, '0')}`;

  const snap = await adminDb.collection('hr_attendance')
    .where('storeId', '==', storeId)
    .where('date', '>=', start)
    .where('date', '<=', end)
    .get();

  const byUid = new Map<string, { dates: Set<string>; lateCount: number }>();
  snap.docs.forEach(doc => {
    const data = doc.data();
    const uid = String(data.uid || data.employeeId || '');
    if (!uid) return;
    if (!byUid.has(uid)) byUid.set(uid, { dates: new Set(), lateCount: 0 });
    const entry = byUid.get(uid)!;
    if (data.date) entry.dates.add(String(data.date));
    if (data.late || data.isLate) entry.lateCount += 1;
  });
  return byUid;
}

async function loadApprovedLeaveDays(storeId: string, period: string) {
  const leaveSnap = await adminDb.collection('hr_leave_requests')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .get();

  const dayoffSnap = await adminDb.collection('hr_dayoff_requests')
    .where('storeId', '==', storeId)
    .where('status', '==', 'approved')
    .get();

  const byUid = new Map<string, number>();

  const addDays = (uid: string, days: number) => {
    byUid.set(uid, (byUid.get(uid) || 0) + days);
  };

  leaveSnap.docs.forEach(doc => {
    const data = doc.data();
    const uid = String(data.userId || data.uid || '');
    if (!uid) return;
    if (!leaveRequestOverlapsMonth(data.startDate, data.endDate, period)) return;
    const type = String(data.leaveType || data.type || 'annual');
    const days = type.startsWith('half') ? 0.5 : Number(data.days || 1);
    addDays(uid, days);
  });

  dayoffSnap.docs.forEach(doc => {
    const data = doc.data();
    const uid = String(data.userId || data.uid || '');
    if (!uid) return;
    const date = String(data.date || data.startDate || '');
    if (!date.startsWith(period)) return;
    addDays(uid, 1);
  });

  return byUid;
}

export async function buildEmployeePayrollInputs(
  storeId: string,
  period: string,
): Promise<EmployeePayrollInput[]> {
  const employees = await loadActiveEmployees(storeId);
  const attendanceMap = await loadAttendanceForMonth(storeId, period);
  const leaveMap = await loadApprovedLeaveDays(storeId, period);
  const workDays = countWorkDaysInMonth(period);

  return employees.map(emp => {
    const uid = String(emp.linkedUid || '');
    const att = uid ? attendanceMap.get(uid) : undefined;
    const actualWorkDays = att?.dates.size || 0;
    const leaveDays = uid ? (leaveMap.get(uid) || 0) : 0;
    const absenceDays = Math.max(0, workDays - actualWorkDays - leaveDays);

    const attendance: AttendanceSummary = {
      workDays,
      actualWorkDays,
      leaveDays,
      absenceDays,
      lateCount: att?.lateCount || 0,
    };

    const salary = emp.salary || {
      type: 'monthly',
      baseSalary: 0,
      mealAllowance: 0,
      transportAllowance: 0,
      otherAllowances: [],
      totalMonthly: 0,
      payDay: 25,
      bankName: '',
    };

    return {
      empNo: String(emp.empNo || ''),
      empName: String(emp.name || ''),
      department: String(emp.department || ''),
      position: String(emp.position || ''),
      status: String(emp.status || '재직'),
      hireDate: String(emp.hireDate || ''),
      resignDate: emp.resignDate ? String(emp.resignDate) : undefined,
      salary,
      attendance,
    };
  }).filter(e => e.empNo);
}

export async function runPayrollCalculation(
  storeId: string,
  period: string,
  createdBy: string,
) {
  const existing = await adminDb.collection('hr_payroll_runs').doc(`${storeId}_${period}`).get();
  if (existing.exists && existing.data()?.status === 'confirmed') {
    throw new Error('이미 확정된 급여 마감입니다. 취소 후 재계산하세요.');
  }

  const settings = await loadPayrollSettings(storeId);
  const inputs = await buildEmployeePayrollInputs(storeId, period);
  const { run, slips } = calculatePayrollRun(storeId, period, inputs, settings, createdBy);

  const batch = adminDb.batch();
  const runRef = adminDb.collection('hr_payroll_runs').doc(run.id);
  batch.set(runRef, run, { merge: true });

  slips.forEach(slip => {
    const ref = adminDb.collection('hr_payroll_slips').doc(slip.id);
    batch.set(ref, slip, { merge: true });
  });

  await batch.commit();
  return { run, slipCount: slips.length };
}

export async function getPayrollRun(storeId: string, period: string): Promise<PayrollRun | null> {
  const snap = await adminDb.collection('hr_payroll_runs').doc(`${storeId}_${period}`).get();
  return snap.exists ? ({ id: snap.id, ...snap.data() } as PayrollRun) : null;
}

export async function listPayrollRuns(storeId: string): Promise<PayrollRun[]> {
  const snap = await adminDb.collection('hr_payroll_runs')
    .where('storeId', '==', storeId)
    .orderBy('period', 'desc')
    .limit(24)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollRun));
}

export async function listPayrollSlips(storeId: string, period: string): Promise<PayrollSlip[]> {
  const snap = await adminDb.collection('hr_payroll_slips')
    .where('storeId', '==', storeId)
    .where('period', '==', period)
    .get();
  return snap.docs.map(d => ({ id: d.id, ...d.data() } as PayrollSlip))
    .sort((a, b) => a.empName.localeCompare(b.empName, 'ko'));
}

export async function confirmPayrollRun(
  storeId: string,
  period: string,
  confirmedBy: string,
) {
  const runRef = adminDb.collection('hr_payroll_runs').doc(`${storeId}_${period}`);
  const runSnap = await runRef.get();
  if (!runSnap.exists) throw new Error('급여 마감 데이터가 없습니다.');

  const batch = adminDb.batch();
  batch.update(runRef, {
    status: 'confirmed',
    confirmedAt: new Date().toISOString(),
    confirmedBy,
    updatedAt: new Date().toISOString(),
  });

  const slips = await listPayrollSlips(storeId, period);
  slips.forEach(slip => {
    batch.update(adminDb.collection('hr_payroll_slips').doc(slip.id), {
      status: 'confirmed',
      updatedAt: new Date().toISOString(),
    });
  });

  await batch.commit();
}

export async function cancelPayrollRun(storeId: string, period: string) {
  const runRef = adminDb.collection('hr_payroll_runs').doc(`${storeId}_${period}`);
  const runSnap = await runRef.get();
  if (!runSnap.exists) throw new Error('급여 마감 데이터가 없습니다.');

  await runRef.update({
    status: 'cancelled',
    updatedAt: new Date().toISOString(),
  });
}
