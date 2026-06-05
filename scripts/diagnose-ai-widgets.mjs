/**
 * AI 위젯 데이터 진단
 * Usage: node scripts/diagnose-ai-widgets.mjs [storeId]
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const storeId = process.argv[2] || process.env.POS_STORE_ID || '';
if (!storeId) {
  console.error('storeId required (arg or POS_STORE_ID)');
  process.exit(1);
}

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());

async function count(col, ...queries) {
  let q = db.collection(col);
  for (const [field, op, val] of queries) q = q.where(field, op, val);
  const snap = await q.limit(5).get();
  return snap.size;
}

async function main() {
  console.log('storeId:', storeId);
  console.log('today:', today);
  console.log('AI keys:', {
    gemini: !!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY),
    claude: !!process.env.ANTHROPIC_API_KEY,
    openai: !!process.env.OPENAI_API_KEY,
    groq: !!process.env.GROQ_API_KEY,
  });

  const [detail, header, daily, dr, posDaily, cacheComp, cachePartner] = await Promise.all([
    count('pos_sales_detail', ['storeId', '==', storeId]),
    count('pos_sales_header', ['storeId', '==', storeId]),
    count('pos_finish_total', ['storeId', '==', storeId]),
    count('daily_reports', ['storeId', '==', storeId]),
    db.collection('pos_daily_sales').doc(`${storeId}_${today}`).get(),
    db.collection('dashboard_cache').doc(`market_briefing_${storeId}_${today}`).get(),
    db.collection('ai_partner_predictions').doc(`${storeId}_${today}`).get(),
  ]);

  console.log('\nFirestore counts (sample):');
  console.log('  pos_sales_detail:', detail);
  console.log('  pos_sales_header:', header);
  console.log('  pos_finish_total:', daily);
  console.log('  daily_reports:', dr);
  console.log('  pos_daily_sales today:', posDaily.exists ? 'YES' : 'NO', posDaily.data()?.netSales ?? posDaily.data()?.totalSales);

  if (cacheComp.exists) {
    const r = cacheComp.data()?.result || {};
    console.log('\ncomprehensive cache:', {
      noData: r.noData,
      hasOpinion: !!r.opinion,
      summary: (r.summary || '').slice(0, 60),
    });
  } else console.log('\ncomprehensive cache: none');

  if (cachePartner.exists) {
    const d = cachePartner.data();
    console.log('\npartner cache:', {
      noData: d.noData,
      todayOpinion: !!(d.today?.opinion),
      error: d.error,
    });
  } else console.log('\npartner cache: none');

  const kw = await db.collection('naver_trend_keywords').doc(storeId).get();
  if (kw.exists) {
    const g = (kw.data()?.keywordGroups || []).filter(x => x.active);
    console.log('\nnaver keywords: active groups', g.length);
  } else console.log('\nnaver keywords: doc missing');
}

main().catch(e => { console.error(e); process.exit(1); });
