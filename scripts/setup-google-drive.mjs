/**
 * Google Drive 연결 bootstrap
 * Usage: node scripts/setup-google-drive.mjs
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';
const BASE = process.env.NEXT_PUBLIC_APP_URL?.startsWith('https://')
  ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  : 'https://pitaya-osv1.vercel.app';
const SECRET = process.env.HYGIENE_CRON_SECRET;

if (!SECRET) {
  console.error('HYGIENE_CRON_SECRET missing');
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

async function main() {
  const setupUrl = `${BASE}/api/admin/drive-setup?secret=${encodeURIComponent(SECRET)}&storeId=${encodeURIComponent(STORE_ID)}`;

  const res = await fetch(setupUrl, { redirect: 'manual' });
  console.log('setup status:', res.status);

  if (res.status === 200) {
    const data = await res.json();
    console.log('Drive already connected:', data);
    return;
  }

  if (res.status === 307 || res.status === 302) {
    const oauthUrl = res.headers.get('location');
    console.log('\n브라우저에서 Google 로그인 후 허용해 주세요:\n');
    console.log(oauthUrl || setupUrl);
    console.log('\n완료 후 Firestore store_settings에 토큰이 저장됩니다.');
    return;
  }

  const text = await res.text();
  console.log(text.slice(0, 500));

  const doc = await db.collection('store_settings').doc(STORE_ID).get();
  if (doc.data()?.googleDriveRefreshToken) {
    console.log('\n✅ Firestore Drive 연결됨:', doc.data()?.googleDriveEmail || '(email unknown)');
  }
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
