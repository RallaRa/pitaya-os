/**
 * 기존 미전표 매입 → 자동전표처리 대기열 등록
 * Usage: npx tsx scripts/sync-purchase-auto-vouchers.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { syncPurchasesToAutoVoucherQueue } from '../src/lib/accounting/autoVoucherQueue.server';

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
  const result = await syncPurchasesToAutoVoucherQueue(STORE_ID, UID);
  console.log(`OK ${STORE_ID} synced=${result.synced} skipped=${result.skipped} errors=${result.errors.length}`);
  if (result.errors.length) console.log(result.errors.slice(0, 10).join('\n'));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
