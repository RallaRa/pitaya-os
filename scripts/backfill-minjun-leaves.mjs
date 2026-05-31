/**
 * 최민준 연차 사용 내역 백필
 * Usage: node scripts/backfill-minjun-leaves.mjs
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STORE_ID = 'STR-1779194754785';
const UID = 'd62RTQL3zeMcb35C6tdXx59TTeo2';
const NAME = '최민준';
const EMAIL = 'minjun1432@gmail.com';
const EMP_NO = '25001';
const HIRE_DATE = '2025-08-08';
const DAYS_OFF = ['월', '화'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];
const AS_OF = '2026-05-31';

/** 연차 사용 내역 (관리자 제공) */
const LEAVE_RECORDS = [
  { start: '2025-09-03', end: '2025-09-03', label: '25년 9월 3일' },
  { start: '2025-10-08', end: '2025-10-10', label: '25년 10월 8~10일' },
  { start: '2025-11-12', end: '2025-11-12', label: '25년 11월 12일' },
  { start: '2025-12-31', end: '2025-12-31', label: '25년 12월 31일' },
  { start: '2026-01-23', end: '2026-01-23', label: '26년 1월 23일' },
  { start: '2026-02-22', end: '2026-02-22', label: '26년 2월 22일' },
  { start: '2026-04-01', end: '2026-04-01', label: '26년 4월 1일' },
  { start: '2026-05-02', end: '2026-05-02', label: '26년 5월 2일' },
  { start: '2026-05-30', end: '2026-05-30', label: '26년 5월 30일' },
];

function parseYmd(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function formatYmd(d) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(d, n) {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function isDayOff(d) {
  return DAYS_OFF.includes(DAY_NAMES[d.getDay()]);
}

function countLeaveDays(startStr, endStr) {
  const start = parseYmd(startStr);
  const end = parseYmd(endStr);
  let days = 0;
  for (let d = new Date(start); d <= end; d = addDays(d, 1)) {
    if (!isDayOff(d)) days += 1;
  }
  return days;
}

function isFullAttendanceMonth(monthStart, monthEnd, hireDate, attendanceDates) {
  let workDays = 0;
  let attendDays = 0;
  for (let d = new Date(monthStart); d <= monthEnd; d = addDays(d, 1)) {
    if (d < hireDate) continue;
    if (isDayOff(d)) continue;
    workDays += 1;
    if (attendanceDates.has(formatYmd(d))) attendDays += 1;
  }
  return workDays > 0 && attendDays >= workDays;
}

function countFullMonths(hireDate, asOf, attendanceDates) {
  let count = 0;
  let cursor = new Date(hireDate.getFullYear(), hireDate.getMonth(), 1);
  const end = new Date(asOf.getFullYear(), asOf.getMonth(), 1);
  while (cursor <= end) {
    const monthStart = new Date(cursor);
    const monthEnd = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    const effStart = monthStart < hireDate ? hireDate : monthStart;
    const effEnd = monthEnd > asOf ? asOf : monthEnd;
    if (effStart <= effEnd && isFullAttendanceMonth(effStart, effEnd, hireDate, attendanceDates)) {
      count += 1;
    }
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }
  return count;
}

async function fetchAttendance(from, to) {
  const snap = await db.collection('hr_attendance')
    .where('uid', '==', UID)
    .where('storeId', '==', STORE_ID)
    .limit(2000)
    .get();
  const dates = new Set();
  snap.docs.forEach(doc => {
    const data = doc.data();
    if (data.date >= from && data.date <= to && data.checkIn) dates.add(data.date);
  });
  return dates;
}

async function main() {
  const hireDate = parseYmd(HIRE_DATE);
  const asOf = parseYmd(AS_OF);

  let totalUsed = 0;
  for (const rec of LEAVE_RECORDS) {
    const days = countLeaveDays(rec.start, rec.end);
    totalUsed += days;
    console.log(`  ${rec.label}: ${days}일 (${rec.start}${rec.start !== rec.end ? '~' + rec.end : ''})`);
  }
  console.log(`\n총 사용 연차: ${totalUsed}일`);

  const attendanceDates = await fetchAttendance(HIRE_DATE, AS_OF);
  const fullMonths = countFullMonths(hireDate, asOf, attendanceDates);
  const totalAnnualLeave = fullMonths; // 1년 미만: 만근 월 1일
  console.log(`부여 연차 (만근 ${fullMonths}개월): ${totalAnnualLeave}일`);
  console.log(`잔여: ${totalAnnualLeave - totalUsed}일\n`);

  const ts = FieldValue.serverTimestamp();

  for (const rec of LEAVE_RECORDS) {
    await db.collection('hr_leave_requests').add({
      userId: UID,
      userName: NAME,
      userEmail: EMAIL,
      storeId: STORE_ID,
      type: 'annual',
      startDate: rec.start,
      endDate: rec.end,
      reason: `연차 사용 (${rec.label}) — 관리자 백필`,
      status: 'approved',
      createdAt: ts,
      approvedBy: 'script',
      approvedByName: '관리자 백필',
      approvedAt: ts,
      daysDeducted: true,
      source: 'backfill',
    });
  }
  console.log(`✅ 연차 신청 ${LEAVE_RECORDS.length}건 등록 (승인완료)`);

  await db.collection('hr_employees').doc(`${STORE_ID}_${EMP_NO}`).update({
    totalAnnualLeave,
    usedAnnualLeave: totalUsed,
    hireDate: HIRE_DATE,
    annualLeaveBase: HIRE_DATE,
    lastLeaveYear: 1,
    leaveYearStart: HIRE_DATE,
    lastLeaveGeneratedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  console.log(`✅ 사원 연차 갱신: 총 ${totalAnnualLeave}일 / 사용 ${totalUsed}일 / 잔여 ${totalAnnualLeave - totalUsed}일`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
