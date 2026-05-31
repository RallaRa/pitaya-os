import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import {
  calculateAnnualLeaveEntitlement,
  formatYmd,
} from '@/lib/hr/annualLeave';
import { logLeaveGrant } from '@/lib/hr/leaveBalance';

function todayStr() {
  return formatYmd(new Date());
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
    if (date && date >= fromDate && date <= toDate && data.checkIn) dates.add(date);
  });
  return dates;
}

/** 매월 1일 cron — 전 매장 연차 자동 갱신 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const asOf = todayStr();
  let totalUpdated = 0;

  try {
    const storesSnap = await adminDb.collection('stores').get();

    for (const storeDoc of storesSnap.docs) {
      const storeId = storeDoc.id;
      const empSnap = await adminDb.collection('hr_employees')
        .where('storeId', '==', storeId)
        .get();

      for (const doc of empSnap.docs) {
        const emp = doc.data();
        if (emp.status === '퇴사' || !emp.hireDate) continue;

        const attendanceDates = await fetchAttendanceDates(
          emp.linkedUid || '',
          storeId,
          emp.hireDate,
          asOf,
        );

        const calc = calculateAnnualLeaveEntitlement(
          emp.hireDate,
          asOf,
          attendanceDates,
          { daysOff: emp.daysOff || ['토', '일'], resignDate: emp.resignDate || undefined },
        );

        const previousTotal = Number(emp.totalAnnualLeave ?? 0);
        const previousLeaveYear = emp.lastLeaveYear ?? null;
        const isNewLeaveYear = previousLeaveYear !== null &&
          previousLeaveYear !== calc.leaveYearNumber;

        const updates: Record<string, unknown> = {
          totalAnnualLeave: calc.total,
          lastLeaveYear: calc.leaveYearNumber,
          lastLeaveGeneratedAt: new Date().toISOString(),
          leaveYearStart: calc.leaveYearStart,
          updatedAt: new Date().toISOString(),
        };

        if (isNewLeaveYear) updates.usedAnnualLeave = 0;

        if (previousTotal !== calc.total || previousLeaveYear !== calc.leaveYearNumber) {
          await doc.ref.update(updates);
          await logLeaveGrant(storeId, emp.empNo, emp.name, {
            totalAnnualLeave: calc.total,
            previousTotal,
            usedAnnualLeave: isNewLeaveYear ? 0 : Number(emp.usedAnnualLeave ?? 0),
            leaveYearNumber: calc.leaveYearNumber,
            rule: calc.rule,
            generatedBy: 'cron',
          });
          totalUpdated += 1;
        }
      }
    }

    return NextResponse.json({ success: true, asOf, updated: totalUpdated });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'cron failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
