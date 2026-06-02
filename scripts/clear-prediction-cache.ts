/** 오늘 예측 캐시 삭제 — 일평균매출 보정 후 재생성용 */
import dotenv from 'dotenv';
import path from 'path';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: path.join(process.cwd(), '.env.local') });

const STORE_ID = process.env.SEED_STORE_ID || 'STR-1779194754785';

function initDb() {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY missing');
  const sa = JSON.parse(raw) as { private_key?: string };
  if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
  initializeApp({ credential: cert(sa as Parameters<typeof cert>[0]) });
  return getFirestore();
}

function kstTodayYmd(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

async function main() {
  const db = initDb();
  const today = kstTodayYmd();
  const id = `${today}_${STORE_ID}`;
  const ref = db.collection('predictions').doc(id);
  const snap = await ref.get();
  if (!snap.exists) {
    console.log(`no cache: predictions/${id}`);
    return;
  }
  await ref.delete();
  console.log(`deleted predictions/${id}`);
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
