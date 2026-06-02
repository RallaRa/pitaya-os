/** hr_employees remainAnnualLeave / leavePreusedDays 일괄 동기화 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';

function remainFields(total, used) {
  const remain = Number(total) - Number(used);
  return { remainAnnualLeave: remain, leavePreusedDays: remain < 0 ? Math.abs(remain) : 0 };
}

async function main() {
  const snap = await db.collection('hr_employees').where('storeId', '==', STORE_ID).get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.status === '퇴사') continue;
    const total = d.totalAnnualLeave ?? 0;
    const used = d.usedAnnualLeave ?? 0;
    const fields = remainFields(total, used);
    await doc.ref.update({ ...fields, updatedAt: new Date().toISOString() });
    console.log(`${d.name}: 잔여 ${fields.remainAnnualLeave}일${fields.leavePreusedDays ? ` (선사용 ${fields.leavePreusedDays}일)` : ''}`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
