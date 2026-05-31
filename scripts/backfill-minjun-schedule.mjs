/**
 * 최민준 — 입사 2025-08-08, 월·화 정기휴무 + 근무일 만근 출근 기록 백필
 * Usage: node scripts/backfill-minjun-schedule.mjs
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';
const UID = 'd62RTQL3zeMcb35C6tdXx59TTeo2';
const NAME = '최민준';
const EMAIL = 'minjun1432@gmail.com';
const HIRE_DATE = '2025-08-08';
const END_DATE = '2026-05-31';
const DAYS_OFF = ['월', '화'];
const DAY_NAMES = ['일', '월', '화', '수', '목', '금', '토'];

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

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

async function main() {
  const hire = parseYmd(HIRE_DATE);
  const end = parseYmd(END_DATE);

  const dayoffDates = [];
  const workDates = [];

  for (let d = new Date(hire); d <= end; d = addDays(d, 1)) {
    const ds = formatYmd(d);
    if (isDayOff(d)) dayoffDates.push(ds);
    else workDates.push(ds);
  }

  console.log(`기간: ${HIRE_DATE} ~ ${END_DATE}`);
  console.log(`휴무(월·화): ${dayoffDates.length}일, 근무일: ${workDates.length}일`);

  // ── 1. 사원 생성/갱신 ──
  const empNo = '25001';
  const docId = `${STORE_ID}_${empNo}`;
  const empRef = db.collection('hr_employees').doc(docId);
  const empSnap = await empRef.get();
  const now = new Date().toISOString();

  const empData = {
    empNo,
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
  };

  await empRef.set(empData, { merge: true });
  console.log(`✅ 사원 ${empSnap.exists ? '갱신' : '생성'}: ${docId}`);

  // ── 2. 기존 휴무/출근 중복 확인 ──
  const existingDayoff = await db.collection('hr_dayoff_requests')
    .where('storeId', '==', STORE_ID)
    .where('userId', '==', UID)
    .limit(500)
    .get();

  const existingDayoffDates = new Set();
  existingDayoff.docs.forEach(doc => {
    (doc.data().dates || []).forEach(dt => existingDayoffDates.add(dt));
  });

  const newDayoffDates = dayoffDates.filter(d => !existingDayoffDates.has(d));
  console.log(`휴무 등록 대상: ${newDayoffDates.length}일 (기존 ${existingDayoffDates.size}일 스킵)`);

  // 월별로 묶어서 hr_dayoff_requests 등록
  const byMonth = {};
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
      reason: `${mk} 정기휴무 (월·화) — 입사일 기준 백필`,
      status: 'approved',
      createdAt: FieldValue.serverTimestamp(),
      approvedBy: 'script',
      approvedByName: '시스템 백필',
      approvedAt: FieldValue.serverTimestamp(),
    });
    dayoffCreated += dates.length;
  }
  console.log(`✅ 정기휴무 ${dayoffCreated}일 등록 (${Object.keys(byMonth).length}건)`);

  // ── 3. 근무일 출근 기록 백필 (만근) ──
  const existingAtt = await db.collection('hr_attendance')
    .where('uid', '==', UID)
    .where('storeId', '==', STORE_ID)
    .limit(2000)
    .get();

  const existingAttDates = new Set(existingAtt.docs.map(d => d.data().date));
  const newWorkDates = workDates.filter(d => !existingAttDates.has(d));
  console.log(`출근 기록 대상: ${newWorkDates.length}일 (기존 ${existingAttDates.size}일 스킵)`);

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
        source: 'backfill_minjun',
        createdAt: ts,
        updatedAt: ts,
      });
    }
    await batch.commit();
    attCreated += chunk.length;
  }
  console.log(`✅ 출근(만근) 기록 ${attCreated}일 등록`);

  console.log('\n완료 — 연차는 별도 지시 시 반영합니다.');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
