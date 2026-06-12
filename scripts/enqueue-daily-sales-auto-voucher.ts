/**
 * 전일 매출 → 자동전표처리 대기열 등록 (크론과 동일)
 * Usage: npx tsx scripts/enqueue-daily-sales-auto-voucher.ts [YYYY-MM-DD]
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { addDaysYMD, getKSTTodayYMD } from '../src/lib/dateUtils';
import { enqueueDailySalesAutoVoucher } from '../src/lib/accounting/autoVoucherQueue.server';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID = process.env.SEED_STORE_ID || 'STR-1779194754785';
const UID = process.env.SYNC_UID || 'system-sync';

function initAdmin() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
  const sa = JSON.parse(raw) as { private_key?: string };
  if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
}

async function main() {
  initAdmin();
  const argDate = process.argv[2];
  const reportDate = argDate || addDaysYMD(getKSTTodayYMD(), -1);
  const result = await enqueueDailySalesAutoVoucher({
    storeId: STORE_ID,
    reportDate,
    uid: UID,
    sourceScreen: '일별매출집계',
  });
  console.log(`OK ${STORE_ID} ${reportDate}`, result);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
