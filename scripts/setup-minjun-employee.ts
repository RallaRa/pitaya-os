/**
 * 최민준 사원등록 + 만근 출근 + 연차 부여 (입사 2025-08-05)
 * Usage: npx tsx scripts/setup-minjun-employee.ts
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  calculateAnnualLeaveEntitlement,
  countLeaveDaysUsed,
  formatYmd,
  parseYmd,
} from '../src/lib/hr/annualLeave';
import { leaveRemainFields } from '../src/lib/hr/leaveRemainDisplay';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY || '{}');
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';
const UID = 'd62RTQL3zeMcb35C6tdXx59TTeo2';
const NAME = '최민준';
const EMAIL = 'minjun1432@gmail.com';
const EMP_NO = '25001';
const HIRE_DATE = '2025-08-05';
const DAYS_OFF = ['월', '화'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

function addDays(d: Date, n: number) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isDayOff(d: Date) {
  return DAYS_OFF.includes(DAY_NAMES[d.getDay()]);
}

function monthKey(dateStr: string) {
  return dateStr.slice(0, 7);
}

function todayYmd() {
  const now = new Date();
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  return formatYmd(new Date(kst.getUTCFullYear(), kst.getUTCMonth(), kst.getUTCDate()));
}

async function recalculateUsedLeave(storeId: string, userId: string, daysOff: string[]) {
  const snap = await db.collection('hr_leave_requests')
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
  return used;
}

async function fetchAttendance(from: string, to: string) {
  const snap = await db.collection('hr_attendance')
    .where('uid', '==', UID)
    .where('storeId', '==', STORE_ID)
    .limit(2000)
    .get();
  const dates = new Set<string>();
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.date >= from && data.date <= to && data.checkIn) dates.add(data.date);
  });
  return dates;
}

async function main() {
  const hire = parseYmd(HIRE_DATE);
  const end = parseYmd(todayYmd());
  const endStr = formatYmd(end);

  const dayoffDates: string[] = [];
  const workDates: string[] = [];

  for (let d = new Date(hire); d <= end; d = addDays(d, 1)) {
    const ds = formatYmd(d);
    if (isDayOff(d)) dayoffDates.push(ds);
    else workDates.push(ds);
  }

  console.log(`=== 최민준 사원·연차 설정 ===`);
  console.log(`매장: ${STORE_ID}`);
  console.log(`입사일: ${HIRE_DATE} · 기준일: ${endStr}`);
  console.log(`정기휴무: ${DAYS_OFF.join('·')} · 휴무 ${dayoffDates.length}일 / 근무 ${workDates.length}일\n`);

  const docId = `${STORE_ID}_${EMP_NO}`;
  const empRef = db.collection('hr_employees').doc(docId);
  const empSnap = await empRef.get();
  const now = new Date().toISOString();
  const previousTotal = Number(empSnap.data()?.totalAnnualLeave ?? 0);

  await empRef.set({
    empNo: EMP_NO,
    name: NAME,
    storeId: STORE_ID,
    hireDate: HIRE_DATE,
    annualLeaveBase: HIRE_DATE,
    department: '',
    position: '사원',
    status: '재직',
    daysOff: DAYS_OFF,
    workType: '주5일',
    linkedUid: UID,
    linkedEmail: EMAIL,
    updatedAt: now,
    ...(empSnap.exists ? {} : {
      createdAt: now,
      totalAnnualLeave: 0,
      usedAnnualLeave: 0,
      createdBy: 'script',
    }),
  }, { merge: true });
  console.log(`✅ 사원 ${empSnap.exists ? '갱신' : '생성'}: ${docId}`);

  const existingDayoff = await db.collection('hr_dayoff_requests')
    .where('storeId', '==', STORE_ID)
    .where('userId', '==', UID)
    .limit(500)
    .get();
  const existingDayoffDates = new Set<string>();
  existingDayoff.docs.forEach(doc => {
    (doc.data().dates || []).forEach((dt: string) => existingDayoffDates.add(dt));
  });

  const newDayoffDates = dayoffDates.filter(d => !existingDayoffDates.has(d));
  const byMonth: Record<string, string[]> = {};
  for (const dt of newDayoffDates) {
    const mk = monthKey(dt);
    if (!byMonth[mk]) byMonth[mk] = [];
    byMonth[mk].push(dt);
  }

  let dayoffCreated = 0;
  for (const [mk, dates] of Object.entries(byMonth)) {
    dates.sort();
    await db.collection('hr_dayoff_requests').add({
      userId: UID,
      userName: NAME,
      userEmail: EMAIL,
      storeId: STORE_ID,
      type: 'regular',
      dates,
      reason: `${mk} 정기휴무 (월·화) — 입사 ${HIRE_DATE} 기준`,
      status: 'approved',
      createdAt: FieldValue.serverTimestamp(),
      approvedBy: 'script',
      approvedByName: '시스템 설정',
      approvedAt: FieldValue.serverTimestamp(),
    });
    dayoffCreated += dates.length;
  }
  console.log(`✅ 정기휴무 ${dayoffCreated}일 추가 (${Object.keys(byMonth).length}건)`);

  const existingAtt = await db.collection('hr_attendance')
    .where('uid', '==', UID)
    .where('storeId', '==', STORE_ID)
    .limit(2000)
    .get();
  const existingAttDates = new Set(existingAtt.docs.map(d => d.data().date));
  const newWorkDates = workDates.filter(d => !existingAttDates.has(d));
  console.log(`출근 추가 대상: ${newWorkDates.length}일 (기존 ${existingAttDates.size}일)`);

  const BATCH = 400;
  let attCreated = 0;
  const ts = FieldValue.serverTimestamp();
  const payload = { lat: 0, lng: 0, recordedAt: ts, source: 'backfill' };

  for (let i = 0; i < newWorkDates.length; i += BATCH) {
    const chunk = newWorkDates.slice(i, i + BATCH);
    const batch = db.batch();
    for (const date of chunk) {
      const ref = db.collection('hr_attendance').doc();
      batch.set(ref, {
        uid: UID,
        storeId: STORE_ID,
        date,
        checkIn: payload,
        checkOut: { ...payload, recordedAt: ts },
        source: 'setup_minjun',
        createdAt: ts,
        updatedAt: ts,
      });
    }
    await batch.commit();
    attCreated += chunk.length;
  }
  console.log(`✅ 출근(만근) ${attCreated}일 추가`);

  const attendanceDates = await fetchAttendance(HIRE_DATE, endStr);
  const calc = calculateAnnualLeaveEntitlement(HIRE_DATE, endStr, attendanceDates, { daysOff: DAYS_OFF });
  const usedAnnualLeave = await recalculateUsedLeave(STORE_ID, UID, DAYS_OFF);
  const remain = calc.total - usedAnnualLeave;

  await empRef.update({
    hireDate: HIRE_DATE,
    annualLeaveBase: HIRE_DATE,
    totalAnnualLeave: calc.total,
    usedAnnualLeave,
    ...leaveRemainFields(calc.total, usedAnnualLeave),
    lastLeaveYear: calc.leaveYearNumber,
    leaveYearStart: calc.leaveYearStart,
    lastLeaveGeneratedAt: now,
    updatedAt: now,
  });

  await db.collection('hr_annual_leave_grants').add({
    storeId: STORE_ID,
    empNo: EMP_NO,
    name: NAME,
    totalAnnualLeave: calc.total,
    previousTotal,
    usedAnnualLeave,
    leaveYearNumber: calc.leaveYearNumber,
    rule: calc.rule,
    generatedBy: 'setup-minjun-employee',
    createdAt: FieldValue.serverTimestamp(),
  });

  console.log(`\n✅ 연차 부여`);
  console.log(`   규칙: ${calc.rule}`);
  console.log(`   만근 월: ${calc.fullMonths}개월 · 연차연도: ${calc.leaveYearNumber}`);
  console.log(`   총 ${calc.total}일 / 사용 ${usedAnnualLeave}일 / 잔여 ${remain}일`);
  console.log(`\n완료 — 사원등록·연차현황에서 확인하세요.`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
