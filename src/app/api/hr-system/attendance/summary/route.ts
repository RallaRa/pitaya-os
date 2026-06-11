import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildEmployeePayrollInputs } from '@/lib/hr-system/payrollService';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const period = searchParams.get('period') || new Date().toISOString().slice(0, 7);

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  if (!/^\d{4}-\d{2}$/.test(period)) {
    return NextResponse.json({ error: 'period는 YYYY-MM' }, { status: 400 });
  }

  const inputs = await buildEmployeePayrollInputs(storeId, period);
  const rows = inputs
    .filter(e => e.status === '재직' || e.status === '수습')
    .map(e => ({
      empNo: e.empNo,
      empName: e.empName,
      department: e.department,
      position: e.position,
      workDays: e.attendance.workDays,
      actualWorkDays: e.attendance.actualWorkDays,
      leaveDays: e.attendance.leaveDays,
      absenceDays: e.attendance.absenceDays,
      lateCount: e.attendance.lateCount,
    }))
    .sort((a, b) => a.empName.localeCompare(b.empName, 'ko'));

  const totals = rows.reduce(
    (acc, r) => ({
      actualWorkDays: acc.actualWorkDays + r.actualWorkDays,
      leaveDays: acc.leaveDays + r.leaveDays,
      absenceDays: acc.absenceDays + r.absenceDays,
      lateCount: acc.lateCount + r.lateCount,
    }),
    { actualWorkDays: 0, leaveDays: 0, absenceDays: 0, lateCount: 0 },
  );

  return NextResponse.json({ period, rows, totals, employeeCount: rows.length });
}
