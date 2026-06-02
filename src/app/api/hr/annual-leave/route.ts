import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId } from '@/lib/authVerify';
import {
  calculateAnnualLeaveEntitlement,
  formatYmd,
} from '@/lib/hr/annualLeave';
import { logLeaveGrant } from '@/lib/hr/leaveBalance';
import { computeLeaveRemain, leaveRemainFields } from '@/lib/hr/leaveRemainDisplay';

const ADMIN_ROLES = ['master', 'admin', 'owner'];

async function isStoreAdmin(uid: string, storeId: string) {
  const role = await getActualGroupId(uid, storeId);
  return ADMIN_ROLES.includes(role);
}

function todayStr() {
  const d = new Date();
  return formatYmd(d);
}

async function fetchAttendanceDates(
  uid: string,
  storeId: string,
  fromDate: string,
  toDate: string,
): Promise<Set<string>> {
  if (!uid) return new Set();

  const snap = await adminDb.collection('hr_attendance')
    .where('uid', '==', uid)
    .where('storeId', '==', storeId)
    .limit(2000)
    .get();

  const dates = new Set<string>();
  snap.docs.forEach(doc => {
    const data = doc.data();
    const date = data.date as string;
    if (!date || date < fromDate || date > toDate) return;
    if (data.checkIn) dates.add(date);
  });
  return dates;
}

async function buildEmployeeLeavePreview(
  emp: FirebaseFirestore.DocumentData,
  storeId: string,
  asOf: string,
) {
  const hireDate = emp.hireDate as string;
  if (!hireDate) {
    return {
      empNo: emp.empNo,
      name: emp.name,
      department: emp.department || '',
      hireDate: '',
      status: emp.status || '',
      linkedUid: emp.linkedUid || '',
      totalAnnualLeave: emp.totalAnnualLeave ?? 0,
      usedAnnualLeave: emp.usedAnnualLeave ?? 0,
      error: '입사일 없음',
    };
  }

  const fromDate = hireDate;
  const attendanceDates = await fetchAttendanceDates(
    emp.linkedUid || '',
    storeId,
    fromDate,
    asOf,
  );

  const calc = calculateAnnualLeaveEntitlement(
    hireDate,
    asOf,
    attendanceDates,
    {
      daysOff: emp.daysOff || ['토', '일'],
      resignDate: emp.resignDate || undefined,
    },
  );

  const total = Number(emp.totalAnnualLeave ?? 0);
  const used = Number(emp.usedAnnualLeave ?? 0);
  const remain = Number(emp.remainAnnualLeave ?? computeLeaveRemain(total, used));

  return {
    empNo: emp.empNo,
    name: emp.name,
    department: emp.department || '',
    hireDate,
    status: emp.status || '재직',
    linkedUid: emp.linkedUid || '',
    totalAnnualLeave: total,
    usedAnnualLeave: used,
    remainAnnualLeave: remain,
    calculatedTotal: calc.total,
    rule: calc.rule,
    completedYears: calc.completedYears,
    fullMonths: calc.fullMonths,
    leaveYearStart: calc.leaveYearStart,
    leaveYearNumber: calc.leaveYearNumber,
    lastLeaveYear: emp.lastLeaveYear ?? null,
    needsUpdate: total !== calc.total || (emp.lastLeaveYear ?? null) !== calc.leaveYearNumber,
  };
}

// GET /api/hr/annual-leave?storeId=X&asOf=YYYY-MM-DD
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const asOf = searchParams.get('asOf') || todayStr();

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const admin = await isStoreAdmin(authUser.uid, storeId);
  if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

  try {
    const snap = await adminDb.collection('hr_employees')
      .where('storeId', '==', storeId)
      .orderBy('name')
      .get();

    const activeEmployees = snap.docs
      .map(d => d.data())
      .filter(e => e.status !== '퇴사');

    const employees = await Promise.all(
      activeEmployees.map(emp => buildEmployeeLeavePreview(emp, storeId, asOf)),
    );

    return NextResponse.json({ asOf, employees });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// POST /api/hr/annual-leave  — 연차 생성/갱신
export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, empNos, asOf, resetUsedOnNewYear = true } = body;

    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const admin = await isStoreAdmin(authUser.uid, storeId);
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    const referenceDate = asOf || todayStr();

    let query: FirebaseFirestore.Query = adminDb.collection('hr_employees')
      .where('storeId', '==', storeId);

    const snap = await query.get();
    let docs = snap.docs.filter(d => d.data().status !== '퇴사');

    if (Array.isArray(empNos) && empNos.length > 0) {
      const set = new Set(empNos);
      docs = docs.filter(d => set.has(d.data().empNo));
    }

    const userDoc = await adminDb.collection('users').doc(authUser.uid).get();
    const generatedBy = userDoc.data()?.name || userDoc.data()?.displayName || '관리자';

    const results: {
      empNo: string;
      name: string;
      previousTotal: number;
      newTotal: number;
      usedReset: boolean;
      rule: string;
    }[] = [];

    for (const doc of docs) {
      const emp = doc.data();
      const hireDate = emp.hireDate as string;
      if (!hireDate) continue;

      const attendanceDates = await fetchAttendanceDates(
        emp.linkedUid || '',
        storeId,
        hireDate,
        referenceDate,
      );

      const calc = calculateAnnualLeaveEntitlement(
        hireDate,
        referenceDate,
        attendanceDates,
        {
          daysOff: emp.daysOff || ['토', '일'],
          resignDate: emp.resignDate || undefined,
        },
      );

      const previousTotal = Number(emp.totalAnnualLeave ?? 0);
      const previousLeaveYear = emp.lastLeaveYear ?? null;
      const isNewLeaveYear = previousLeaveYear !== null &&
        previousLeaveYear !== calc.leaveYearNumber;

      const usedAfter = resetUsedOnNewYear && isNewLeaveYear
        ? 0
        : Number(emp.usedAnnualLeave ?? 0);
      let usedReset = resetUsedOnNewYear && isNewLeaveYear;

      const updates: Record<string, unknown> = {
        totalAnnualLeave: calc.total,
        usedAnnualLeave: usedAfter,
        ...leaveRemainFields(calc.total, usedAfter),
        lastLeaveYear: calc.leaveYearNumber,
        lastLeaveGeneratedAt: new Date().toISOString(),
        leaveYearStart: calc.leaveYearStart,
        updatedAt: new Date().toISOString(),
      };

      await doc.ref.update(updates);

      await logLeaveGrant(storeId, emp.empNo, emp.name, {
        totalAnnualLeave: calc.total,
        previousTotal,
        usedAnnualLeave: usedReset ? 0 : Number(emp.usedAnnualLeave ?? 0),
        leaveYearNumber: calc.leaveYearNumber,
        rule: calc.rule,
        generatedBy,
      });

      results.push({
        empNo: emp.empNo,
        name: emp.name,
        previousTotal,
        newTotal: calc.total,
        usedReset,
        rule: calc.rule,
      });
    }

    return NextResponse.json({
      success: true,
      asOf: referenceDate,
      updated: results.length,
      results,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '생성 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
