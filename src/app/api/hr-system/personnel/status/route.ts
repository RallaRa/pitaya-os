import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { loadActiveEmployees } from '@/lib/hr-system/payrollService';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const employees = await loadActiveEmployees(storeId);

  const byStatus: Record<string, number> = {};
  const byDepartment: Record<string, number> = {};
  const byPosition: Record<string, number> = {};
  let active = 0;
  let resigned = 0;
  const recentHires: { empNo: string; name: string; hireDate: string; department: string }[] = [];
  const recentResigns: { empNo: string; name: string; resignDate: string; department: string }[] = [];

  const now = new Date();
  const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, now.getDate());
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  employees.forEach(emp => {
    const status = String(emp.status || '재직');
    byStatus[status] = (byStatus[status] || 0) + 1;
    const dept = String(emp.department || '미지정');
    byDepartment[dept] = (byDepartment[dept] || 0) + 1;
    const pos = String(emp.position || '사원');
    byPosition[pos] = (byPosition[pos] || 0) + 1;

    if (status === '재직' || status === '수습') active++;
    if (status === '퇴직') resigned++;

    const hireDate = String(emp.hireDate || '');
    if (hireDate >= fmt(threeMonthsAgo)) {
      recentHires.push({
        empNo: String(emp.empNo),
        name: String(emp.name),
        hireDate,
        department: dept,
      });
    }

    const resignDate = String(emp.resignDate || '');
    if (status === '퇴직' && resignDate >= fmt(threeMonthsAgo)) {
      recentResigns.push({
        empNo: String(emp.empNo),
        name: String(emp.name),
        resignDate,
        department: dept,
      });
    }
  });

  recentHires.sort((a, b) => b.hireDate.localeCompare(a.hireDate));
  recentResigns.sort((a, b) => b.resignDate.localeCompare(a.resignDate));

  return NextResponse.json({
    summary: {
      total: employees.length,
      active,
      resigned,
      byStatus,
      byDepartment,
      byPosition,
    },
    recentHires: recentHires.slice(0, 20),
    recentResigns: recentResigns.slice(0, 20),
  });
}
