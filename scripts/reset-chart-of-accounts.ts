/**
 * 영림원 표준 계정과목 전체 재등록 (기존 계정 삭제 후 신버전 반영)
 * Usage: npx tsx scripts/reset-chart-of-accounts.ts
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import {
  DEFAULT_CHART_OF_ACCOUNTS,
  defaultAccountToFirestore,
  isFundAccountCode,
} from '../src/lib/accounting/defaultChartOfAccounts';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID = process.env.SEED_STORE_ID || 'STR-1779194754785';
const BATCH_LIMIT = 400;

function initDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
  const sa = JSON.parse(raw) as { private_key?: string };
  if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  return getFirestore();
}

function accountDocId(storeId: string, code: string) {
  return `${storeId}_${code}`;
}

async function main() {
  const db = initDb();
  const snap = await db.collection('accounting_accounts')
    .where('storeId', '==', STORE_ID)
    .get();

  console.log(`Deleting ${snap.size} existing accounts for ${STORE_ID}...`);
  for (let i = 0; i < snap.docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    snap.docs.slice(i, i + BATCH_LIMIT).forEach(doc => batch.delete(doc.ref));
    await batch.commit();
  }

  console.log(`Seeding ${DEFAULT_CHART_OF_ACCOUNTS.length} standard accounts...`);
  for (let i = 0; i < DEFAULT_CHART_OF_ACCOUNTS.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    const chunk = DEFAULT_CHART_OF_ACCOUNTS.slice(i, i + BATCH_LIMIT);

    for (const ac of chunk) {
      const payload = defaultAccountToFirestore(ac, STORE_ID);
      batch.set(db.collection('accounting_accounts').doc(accountDocId(STORE_ID, ac.code)), {
        ...payload,
        isFundAccount: isFundAccountCode(ac.code),
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }

    await batch.commit();
  }

  const verify = await db.collection('accounting_accounts')
    .where('storeId', '==', STORE_ID)
    .get();

  console.log(`OK accounting_accounts/${STORE_ID} deleted=${snap.size} seeded=${verify.size}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
