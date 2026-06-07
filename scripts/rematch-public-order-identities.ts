/**
 * public_order_identities 전체 재매칭
 *
 * Usage:
 *   npx tsx scripts/rematch-public-order-identities.ts --dry-run
 *   npx tsx scripts/rematch-public-order-identities.ts
 *   npx tsx scripts/rematch-public-order-identities.ts --store=STR-1779194754785
 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import {
  buildPhoneMatchIndex,
  getIdentityPhoneDigits,
  matchCustomerFromIndex,
  matchPatchFromResult,
  applyDemographicsToCustomer,
  normalizeGender,
} from '../src/lib/publicOrderIdentity';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID =
  process.argv.find(a => a.startsWith('--store='))?.split('=')[1] ||
  process.env.POS_STORE_ID ||
  'STR-1779194754785';
const DRY_RUN = process.argv.includes('--dry-run');

function initFirebase() {
  if (getApps().length) return getFirestore();
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing in .env.local');
  initializeApp({ credential: cert(JSON.parse(raw)) });
  return getFirestore();
}

async function main() {
  const db = initFirebase();
  console.log(`store=${STORE_ID} dryRun=${DRY_RUN}`);

  const customerSnap = await db.collection('pos_customers')
    .where('storeId', '==', STORE_ID)
    .get();
  const index = buildPhoneMatchIndex(
    customerSnap.docs.map(doc => ({
      cusCode: String(doc.data().cusCode || doc.id.split('_').slice(1).join('_')),
      data: doc.data() as Record<string, unknown>,
    })),
  );
  console.log(`pos_customers=${customerSnap.size}`);

  const identitySnap = await db.collection('public_order_identities')
    .where('storeId', '==', STORE_ID)
    .where('resolved', '==', false)
    .get();
  console.log(`unresolved identities=${identitySnap.size}`);

  let updated = 0;
  const counts = { matched: 0, partial: 0, ambiguous: 0, unmatched: 0 };

  for (const doc of identitySnap.docs) {
    const data = doc.data();
    if (data.resolved === true && data.matchStatus === 'matched') continue;

    const phoneDigits = getIdentityPhoneDigits(data as Record<string, unknown>);
    if (!phoneDigits) continue;

    const match = matchCustomerFromIndex(index, phoneDigits);
    const prevStatus = String(data.matchStatus || '');
    const prevCus = data.matchedCusCode ? String(data.matchedCusCode) : '';
    const nextCus = match.status === 'matched' ? String(match.cusCode || '') : '';

    if (prevStatus === match.status && prevCus === nextCus) continue;

    console.log(
      `  ${doc.id.slice(0, 8)}… ${prevStatus || '-'} → ${match.status}` +
      (match.cusCode ? ` (${match.cusCode})` : ''),
    );

    if (!DRY_RUN) {
      await doc.ref.update(matchPatchFromResult(match));
      if (match.status === 'matched' && match.cusCode) {
        await applyDemographicsToCustomer(STORE_ID, match.cusCode, {
          gender: normalizeGender(String(data.gender || '')),
          ageRange: String(data.ageRange || ''),
          birthYear: data.birthYear != null ? Number(data.birthYear) : null,
        });
      }
    }

    updated += 1;
    counts[match.status] += 1;
  }

  console.log('---');
  console.log(`updated=${updated}`, counts);
  if (DRY_RUN) console.log('(dry-run: no writes)');
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
