/**
 * 매출 하락 알림 즉시 테스트 발송
 * Usage: node scripts/send-sales-alert-now.mjs [--force]
 */
import dotenv from 'dotenv';
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

dotenv.config({ path: '.env.local' });

const sa = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
if (sa.private_key?.includes('\\n')) sa.private_key = sa.private_key.replace(/\\n/g, '\n');
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const STORE_ID = process.env.POS_STORE_ID || 'STR-1779194754785';
const APP_BASE = process.env.NEXT_PUBLIC_APP_URL?.startsWith('http')
  ? process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')
  : 'https://pitaya-osv1.vercel.app';
const FORCE = process.argv.includes('--force');

function getKSTHour() {
  return Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Seoul', hour: 'numeric', hour12: false }).format(new Date()),
  );
}

function getKSTTodayYMD() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(new Date());
}

function dailyReportDocId(storeId, date) {
  return `${storeId}_${date}`;
}

function parseHour(raw) {
  if (raw == null || raw === '') return null;
  const h = parseInt(String(raw).replace(/:.*/, ''), 10);
  return Number.isNaN(h) ? null : h;
}

function cumulativeSalesBetweenHours(snapshot, fromHour, toHour) {
  if (!snapshot) return 0;
  const slots = snapshot.timeSlots || [];
  if (slots.length > 0) {
    let total = 0;
    for (const s of slots) {
      const h = parseHour(s.hour);
      if (h == null) continue;
      if (h >= fromHour && h <= toHour) total += Number(s.totalSale || 0);
    }
    if (total > 0) return total;
  }
  let total = 0;
  for (const it of snapshot.items || []) {
    const h = parseHour((it.time || '').split(':')[0]);
    if (h == null) continue;
    if (h >= fromHour && h <= toHour) total += Number(it.netSales ?? it.amount ?? 0);
  }
  return total;
}

async function loadSnapshot(storeId, date) {
  const id = dailyReportDocId(storeId, date);
  const reportSnap = await db.collection('daily_reports').doc(id).get();
  if (reportSnap.exists) {
    const d = reportSnap.data();
    return { timeSlots: d.timeSlots || [], items: d.items || [] };
  }
  const posSnap = await db.collection('pos_daily_sales').doc(id).get();
  if (posSnap.exists) {
    const d = posSnap.data();
    return { timeSlots: d.timeSlots || [], items: [] };
  }
  return null;
}

function getCompareDates(baseDate) {
  const base = new Date(`${baseDate}T12:00:00+09:00`);
  const fmt = (d) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Seoul' }).format(d);
  const yesterday = new Date(base);
  yesterday.setDate(yesterday.getDate() - 1);
  const lastWeekDow = new Date(base);
  lastWeekDow.setDate(lastWeekDow.getDate() - 7);
  const lastMonthDow = new Date(base);
  lastMonthDow.setMonth(lastMonthDow.getMonth() - 1);
  const lastYearMonthDow = new Date(base);
  lastYearMonthDow.setFullYear(lastYearMonthDow.getFullYear() - 1);
  return {
    yesterday: fmt(yesterday),
    lastWeekDow: fmt(lastWeekDow),
    lastMonthDow: fmt(lastMonthDow),
    lastYearMonthDow: fmt(lastYearMonthDow),
  };
}

async function getValidKakaoToken(uid) {
  const userDoc = await db.collection('users').doc(uid).get();
  if (!userDoc.exists) return null;
  const user = userDoc.data();
  if (!user.kakaoAccessToken) return null;

  const expiresAt = user.kakaoTokenExpiresAt?.toDate?.() || null;
  if (!expiresAt || expiresAt.getTime() > Date.now() + 60_000) {
    return user.kakaoAccessToken;
  }
  if (!user.kakaoRefreshToken) return user.kakaoAccessToken;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: process.env.KAKAO_REST_API_KEY,
    refresh_token: user.kakaoRefreshToken,
    client_secret: process.env.KAKAO_CLIENT_SECRET || '',
  });

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) return user.kakaoAccessToken;

  await db.collection('users').doc(uid).update({
    kakaoAccessToken: data.access_token,
    ...(data.refresh_token ? { kakaoRefreshToken: data.refresh_token } : {}),
    kakaoTokenExpiresAt: new Date(Date.now() + (data.expires_in || 21600) * 1000),
  });
  return data.access_token;
}

async function sendKakao(uid, title, message, link) {
  const token = await getValidKakaoToken(uid);
  if (!token) return { ok: false, error: '카카오 로그인 필요' };

  const webUrl = link.startsWith('http') ? link : `${APP_BASE}${link}`;
  const templateObject = {
    object_type: 'feed',
    content: {
      title,
      description: message,
      image_url: `${APP_BASE}/images/kakao-feed.png`,
      image_width: 800,
      image_height: 400,
      link: { web_url: webUrl, mobile_web_url: webUrl },
    },
    buttons: [{ title: 'Pitaya OS 열기', link: { web_url: webUrl, mobile_web_url: webUrl } }],
  };

  const res = await fetch('https://kapi.kakao.com/v2/api/talk/memo/default/send', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({ template_object: JSON.stringify(templateObject) }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.result_code !== 0) {
    return { ok: false, error: data.msg || JSON.stringify(data) };
  }
  return { ok: true };
}

async function notifyUser(uid, { title, message, link, type }) {
  await db.collection('notifications').add({
    targetUid: uid,
    senderUid: '',
    senderName: 'Pitaya OS',
    type: type || 'system',
    title,
    message,
    link,
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
  return sendKakao(uid, title, message, link);
}

async function getStoreActiveUserIds(storeId) {
  const mapSnap = await db.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();
  return [...new Set(mapSnap.docs.map(d => d.data().uid).filter(Boolean))];
}

async function buildMessage(storeId, hour, todayStr) {
  const START = 11;
  const dates = getCompareDates(todayStr);
  const todaySnap = await loadSnapshot(storeId, todayStr);
  const todayTotal = cumulativeSalesBetweenHours(todaySnap, START, hour);

  const benchmarks = [
    { label: '전일', date: dates.yesterday },
    { label: '전주 동요일', date: dates.lastWeekDow },
    { label: '전달 동요일', date: dates.lastMonthDow },
    { label: '전년 동요일', date: dates.lastYearMonthDow },
  ];

  const drops = [];
  for (const bm of benchmarks) {
    const snap = await loadSnapshot(storeId, bm.date);
    const benchTotal = cumulativeSalesBetweenHours(snap, START, hour);
    if (benchTotal <= 0) continue;
    const dropPct = (benchTotal - todayTotal) / benchTotal;
    if (dropPct >= 0.1) {
      drops.push({ label: bm.label, dropPct });
    }
  }

  if (drops.length || FORCE) {
    const dropLines = (drops.length ? drops : [{ label: '전일(테스트)', dropPct: 0.15 }])
      .slice(0, 3)
      .map(d => `${d.label} ${Math.round(d.dropPct * 100)}%↓`)
      .join(', ');

    const focusItems = ['한우 등심', '돼지 삼겹살', 'LA갈비', '목살', '소불고기'];
    const itemLines = focusItems.map((name, i) => `${i + 1}. ${name}`).join('\n');
    const prefix = FORCE && !drops.length ? '[테스트] ' : '';

    const message = [
      `${prefix}${START}~${hour}시 누적 ${todayTotal.toLocaleString()}원`,
      `기준 대비 하락: ${dropLines}`,
      '',
      '주력 추천 품목:',
      itemLines,
      '',
      '발주·진열·프로모션 추가 점검을 권장합니다.',
    ].join('\n');

    return { triggered: true, message, todayTotal, drops };
  }

  return { triggered: false, message: '', todayTotal, drops };
}

async function main() {
  const hour = Math.max(getKSTHour(), 11);
  const todayStr = getKSTTodayYMD();
  const storeDoc = await db.collection('stores').doc(STORE_ID).get();
  const storeName = storeDoc.data()?.storeName || STORE_ID;

  const result = await buildMessage(STORE_ID, hour, todayStr);
  if (!result.triggered) {
    console.log('실제 10% 하락 없음. --force 로 테스트 발송');
    process.exit(1);
  }

  const userIds = await getStoreActiveUserIds(STORE_ID);
  if (!userIds.length) {
    console.error('active 사용자 없음');
    process.exit(1);
  }

  const title = `${FORCE && !result.drops.length ? '[테스트] ' : ''}📉 ${hour}시 매출 하락 알림 (${storeName})`;
  let sent = 0;

  for (const uid of userIds) {
    const userDoc = await db.collection('users').doc(uid).get();
    const email = userDoc.data()?.email || uid;
    const kakao = await notifyUser(uid, {
      title,
      message: result.message,
      link: '/dashboard/report/view',
      type: 'sales_hourly_drop',
    });
    console.log(`→ ${email}: 앱 알림 OK, 카카오 ${kakao.ok ? 'OK' : kakao.error}`);
    sent += 1;
  }

  console.log(`\n완료: ${sent}명에게 발송 (${todayStr} ${hour}시 기준)`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
