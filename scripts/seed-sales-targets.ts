/**
 * 이번 달 매출·객수 목표 Firestore 반영
 * Usage: npx tsx scripts/seed-sales-targets.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  createDefaultTargetsDoc,
  normalizeTargetPeriods,
  type StoreSalesTargetsDoc,
} from '../src/lib/salesTargets';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID = process.env.SEED_STORE_ID || 'STR-1779194754785';
const SALES = Number(process.env.SEED_SALES || 40_000_000);
const CUSTOMERS = Number(process.env.SEED_CUSTOMERS || 1200);

function initDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
  const sa = JSON.parse(raw) as { private_key?: string };
  if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  return getFirestore();
}

function kstTodayYm(): string {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
  });
  const parts = fmt.formatToParts(new Date());
  const y = parts.find(p => p.type === 'year')?.value;
  const m = parts.find(p => p.type === 'month')?.value;
  return `${y}-${m}`;
}

async function main() {
  const db = initDb();
  const ym = kstTodayYm();
  const ref = db.collection('store_sales_targets').doc(STORE_ID);
  const snap = await ref.get();
  const base: StoreSalesTargetsDoc = snap.exists
    ? { storeId: STORE_ID, periods: (snap.data()?.periods as StoreSalesTargetsDoc['periods']) || [] }
    : createDefaultTargetsDoc(STORE_ID);

  const periods = normalizeTargetPeriods(
    base.periods.length ? base.periods : createDefaultTargetsDoc(STORE_ID).periods,
  );
  const active = periods.find(p => ym >= p.startYm && ym <= p.endYm) || periods[0];
  if (!active) throw new Error('no active period');
  active.months = {
    ...active.months,
    [ym]: { sales: SALES, customers: CUSTOMERS },
  };

  const doc: StoreSalesTargetsDoc = { storeId: STORE_ID, periods, updatedAt: new Date().toISOString() };
  await ref.set({ ...doc, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  console.log(`OK store_sales_targets/${STORE_ID} ${ym} sales=${SALES} customers=${CUSTOMERS}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
