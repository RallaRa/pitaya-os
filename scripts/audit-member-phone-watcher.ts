/**
 * 최근 N일 회원 전화번호 수집 현황 + 왓쳐(phoneScreenCapturedAt) 점검
 *
 * Usage:
 *   npx tsx scripts/audit-member-phone-watcher.ts
 *   npx tsx scripts/audit-member-phone-watcher.ts --days=3
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const DAYS = Number(process.argv.find(a => a.startsWith('--days='))?.split('=')[1] || '3');
const STORE_ID =
  process.argv.find(a => a.startsWith('--store='))?.split('=')[1] ||
  process.env.POS_STORE_ID ||
  'STR-1779194754785';

function initFirebase() {
  if (getApps().length) return getFirestore();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing in .env.local');
  initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore();
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function daysAgo(n: number) {
  const d = new Date(Date.now() + 9 * 3600_000);
  d.setUTCDate(d.getUTCDate() - n);
  return ymd(d);
}

function inRange(iso: string, from: string): boolean {
  if (!iso) return false;
  const day = iso.slice(0, 10);
  return day >= from;
}

async function main() {
  const db = initFirebase();
  const since = daysAgo(DAYS);
  console.log(`\n=== 회원 전화번호 수집 점검 (최근 ${DAYS}일, since=${since}) ===`);
  console.log(`storeId=${STORE_ID}\n`);

  const snap = await db.collection('pos_customers').where('storeId', '==', STORE_ID).get();
  const all = snap.docs.map(d => ({ id: d.id, ...d.data() } as Record<string, unknown>));

  const recentVisit = all.filter(r => {
    const lv = String(r.lastVisitDate || r.writeDate || '');
    return inRange(lv, since);
  });

  const watcherCaptured = all.filter(r =>
    inRange(String(r.phoneScreenCapturedAt || ''), since),
  );

  const fullPhone = (r: Record<string, unknown>) =>
    r.phoneSource === 'full' && !!r.phoneEncrypted;
  const maskedOnly = (r: Record<string, unknown>) =>
    r.phoneSource === 'masked_only' || (!r.phoneEncrypted && !!r.phoneMasked);
  const needsReconcile = (r: Record<string, unknown>) =>
    r.phoneSource === 'needs_reconcile' || r.phoneNeedsReconcile === true;
  const noPhone = (r: Record<string, unknown>) =>
    !r.phoneEncrypted && !r.phoneMasked;

  const recentFull = recentVisit.filter(fullPhone);
  const recentMissing = recentVisit.filter(r => !fullPhone(r));

  console.log(`전체 회원: ${all.length}`);
  console.log(`최근 ${DAYS}일 방문( lastVisitDate 기준): ${recentVisit.length}`);
  console.log(`  └ 평문 전화 보유(phoneSource=full): ${recentFull.length}`);
  console.log(`  └ 전화 미수집/마스킹만: ${recentMissing.length}`);
  console.log(`\n왓쳐 스크랩(phoneScreenCapturedAt 최근 ${DAYS}일): ${watcherCaptured.length}`);

  const bySource: Record<string, number> = {};
  for (const r of all) {
    const src = String(r.phoneSource || 'unknown');
    bySource[src] = (bySource[src] || 0) + 1;
  }
  console.log('\nphoneSource 분포 (전체):');
  for (const [k, v] of Object.entries(bySource).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v}`);
  }

  if (recentMissing.length > 0) {
    console.log(`\n--- 최근 방문했으나 평문 전화 없음 (상위 30건) ---`);
    const sorted = recentMissing
      .sort((a, b) => String(b.lastVisitDate).localeCompare(String(a.lastVisitDate)))
      .slice(0, 30);
    for (const r of sorted) {
      const code = String(r.cusCode || '');
      const lv = String(r.lastVisitDate || '');
      const masked = String(r.phoneMasked || '(없음)');
      const src = String(r.phoneSource || '?');
      const captured = String(r.phoneScreenCapturedAt || '').slice(0, 10) || '-';
      console.log(`  ${code} | 방문 ${lv} | ${masked} | source=${src} | watcher=${captured}`);
    }
  }

  if (watcherCaptured.length > 0) {
    console.log(`\n--- 왓쳐 최근 캡처 (상위 20건) ---`);
    const sorted = watcherCaptured
      .sort((a, b) => String(b.phoneScreenCapturedAt).localeCompare(String(a.phoneScreenCapturedAt)))
      .slice(0, 20);
    for (const r of sorted) {
      const code = String(r.cusCode || '');
      const at = String(r.phoneScreenCapturedAt || '').slice(0, 19);
      const src = String(r.phoneScreenSource || '?');
      const outcome = String(r.phoneSource || '?');
      console.log(`  ${code} | ${at} | screen=${src} | phone=${outcome}`);
    }
  } else {
    console.log('\n⚠️  최근 기간 왓쳐 캡처 기록 없음 — POS PC 왓쳐 미동작 가능성');
  }

  const salesSnap = await db.collection('pos_customer_sales')
    .where('storeId', '==', STORE_ID)
    .get();
  const recentSalesCodes = new Set<string>();
  for (const doc of salesSnap.docs) {
    const d = doc.data();
    const date = String(d.date || '');
    if (!inRange(date, since)) continue;
    const code = String(d.cusCode || '');
    if (code) recentSalesCodes.add(code);
  }

  const salesMissing = [...recentSalesCodes].filter(code => {
    const row = all.find(r => String(r.cusCode) === code);
    return !row || !fullPhone(row);
  });

  console.log(`\n최근 ${DAYS}일 매출 연동 회원( pos_customer_sales ): ${recentSalesCodes.size}`);
  console.log(`  └ 평문 전화 없음: ${salesMissing.length}`);
  if (salesMissing.length > 0 && salesMissing.length <= 40) {
    console.log(`  └ 코드: ${salesMissing.join(', ')}`);
  } else if (salesMissing.length > 40) {
    console.log(`  └ 코드(일부): ${salesMissing.slice(0, 40).join(', ')} …`);
  }

  console.log('\n=== 점검 완료 ===\n');
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
