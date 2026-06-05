/**
 * Pitaya OS — KT 통화매니저 실시간 전화 알림 (POS PC)
 * C:\pitaya-os\kt-caller.js
 *
 * npm install node-notifier dotenv firebase-admin
 * python kt-caller-poll.py (SQLite 읽기)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { spawn } = require('child_process');
const https = require('https');

function log(msg) {
  console.log(`[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${msg}`);
}

const ENV_PATHS = [
  'C:\\pitaya-bridge\\.env',
  path.join(__dirname, '.env'),
  'C:\\pitaya-os\\.env',
];
let envCount = 0;
for (const envPath of ENV_PATHS) {
  if (!fs.existsSync(envPath)) continue;
  const r = require('dotenv').config({ path: envPath, override: true });
  if (r.parsed) envCount += Object.keys(r.parsed).length;
}
if (envCount) log(`env 로드 완료 (${envCount}항목)`);

const NOTIFIER = (() => {
  try {
    return require('node-notifier');
  } catch {
    return null;
  }
})();

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const STORE_ID = process.env.STORE_ID || 'STR-1779194754785';
const STORE_CALLEE = normalizePhoneDigits(process.env.KT_STORE_PHONE || '0226629592');
const POLL_MS = parseInt(process.env.KT_POLL_MS || '3000', 10);
const STATE_FILE = path.join(__dirname, 'kt-caller-state.json');
const POLL_SCRIPT = path.join(__dirname, 'kt-caller-poll.py');
const PYTHON_CANDIDATES = [
  process.env.PYTHON_CMD,
  'python',
  'py',
  'python3',
].filter(Boolean);
const APP_URL = (process.env.PITAYA_APP_URL || 'https://pitaya-osv1.vercel.app').replace(/\/$/, '');

const ALGORITHM = 'aes-256-gcm';

// ── 유틸 ──────────────────────────────────────────────────────────
function normalizePhoneDigits(phone) {
  if (!phone) return '';
  const d = String(phone).replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('1')) return `0${d}`;
  if (d.length === 11 && d.startsWith('01')) return d;
  if (d.length === 9 && d.startsWith('2')) return `0${d}`;
  if (d.length === 10 && d.startsWith('02')) return d;
  return d;
}

function formatPhoneDisplay(digits) {
  if (!digits) return '';
  if (digits.length === 11 && digits.startsWith('01')) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7)}`;
  }
  if (digits.length === 10 && digits.startsWith('02')) {
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6)}`;
  }
  return digits;
}

function getEncryptionKey() {
  const hex = process.env.ENCRYPTION_KEY || '';
  if (!hex || hex.length !== 64) return null;
  return Buffer.from(hex, 'hex');
}

function decryptText(encryptedText) {
  if (!encryptedText) return '';
  const key = getEncryptionKey();
  if (!key) return '';
  try {
    const buf = Buffer.from(encryptedText, 'base64');
    const iv = buf.subarray(0, 16);
    const tag = buf.subarray(16, 32);
    const encrypted = buf.subarray(32);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);
    return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  } catch {
    return '';
  }
}

function loadState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
  } catch {
    return { lastIdate: '', seen: [] };
  }
}

function saveState(state) {
  state.seen = (state.seen || []).slice(-500);
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function rowKey(row) {
  return `${row.cl_idate}|${row.cl_caller}|${row.cl_absence}|${row.cl_callee}`;
}

function isIncomingToStore(row) {
  const callee = normalizePhoneDigits(row.cl_callee);
  if (!callee || !STORE_CALLEE) return true;
  return callee === STORE_CALLEE || callee.endsWith(STORE_CALLEE.slice(-8));
}

// ── Firebase ──────────────────────────────────────────────────────
let db;
const phoneIndex = new Map();

function initFirebase() {
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 없음 (.env 확인)');
  const sa = JSON.parse(raw);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
  db = admin.firestore();
}

/** 매장 active 사용자 중 카카오 연동된 계정 전원 (웹 알림과 동일 범위) */
async function findKakaoNotifyUsersForStore(storeId) {
  const mapSnap = await db.collection('user_store_map')
    .where('storeId', '==', storeId)
    .where('status', '==', 'active')
    .get();

  const users = [];
  const seen = new Set();

  for (const doc of mapSnap.docs) {
    const uid = doc.data().uid;
    if (!uid || seen.has(uid)) continue;
    const userDoc = await db.collection('users').doc(uid).get();
    if (!userDoc.exists || !userDoc.data()?.kakaoAccessToken) continue;
    seen.add(uid);
    users.push({
      uid,
      nick: userDoc.data()?.kakaoNickname || userDoc.data()?.displayName || uid,
    });
  }

  return users;
}

const KAKAO_REFRESH_BUFFER_MS = 30 * 60 * 1000;

async function getValidKakaoToken(userId) {
  const restKey = process.env.KAKAO_REST_API_KEY;
  if (!restKey) return null;

  const userRef = db.collection('users').doc(userId);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return null;

  const user = userSnap.data();
  if (!user.kakaoAccessToken) return null;

  const now = Date.now();
  const expiry = typeof user.kakaoTokenExpiry === 'number' ? user.kakaoTokenExpiry : 0;

  if (now <= expiry - KAKAO_REFRESH_BUFFER_MS) {
    return user.kakaoAccessToken;
  }
  if (!user.kakaoRefreshToken) return user.kakaoAccessToken;

  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    client_id: restKey,
    refresh_token: String(user.kakaoRefreshToken),
  });
  const secret = process.env.KAKAO_CLIENT_SECRET;
  if (secret) params.set('client_secret', secret);

  const res = await fetch('https://kauth.kakao.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.access_token) {
    return user.kakaoAccessToken;
  }

  const updates = {
    kakaoAccessToken: data.access_token,
    kakaoTokenExpiry: Date.now() + (data.expires_in || 21600) * 1000,
  };
  if (data.refresh_token) updates.kakaoRefreshToken = data.refresh_token;
  await userRef.update(updates);
  return data.access_token;
}

function indexCustomerDoc(data) {
  let digits = '';
  if (data.phone) digits = normalizePhoneDigits(data.phone);
  if (!digits && data.phoneEncrypted) {
    digits = normalizePhoneDigits(decryptText(String(data.phoneEncrypted)));
  }
  if (!digits && data.mobile) digits = normalizePhoneDigits(data.mobile);
  if (!digits) return;
  let name = '';
  if (data.name) name = String(data.name);
  else if (data.nameEncrypted) name = decryptText(String(data.nameEncrypted));
  if (!name && data.cusName) name = String(data.cusName);
  const label = name || '고객';
  phoneIndex.set(digits, label);
  if (digits.length === 11) phoneIndex.set(digits.slice(1), label);
}

async function refreshCustomerIndex() {
  phoneIndex.clear();
  const snap = await db.collection('pos_customers').where('storeId', '==', STORE_ID).get();
  for (const doc of snap.docs) indexCustomerDoc(doc.data());

  try {
    const legacy = await db.collection('customers').where('storeId', '==', STORE_ID).get();
    for (const doc of legacy.docs) indexCustomerDoc(doc.data());
  } catch {
    /* customers 컬렉션 없으면 무시 */
  }

  log(`고객 전화 인덱스 갱신: ${phoneIndex.size}건`);
}

function lookupCustomer(callerRaw) {
  const digits = normalizePhoneDigits(callerRaw);
  if (!digits) return { name: null, digits: '' };
  const name =
    phoneIndex.get(digits) ||
    phoneIndex.get(digits.length === 11 ? digits.slice(1) : `0${digits}`) ||
    null;
  return { name, digits };
}

// ── Python SQLite 폴링 ────────────────────────────────────────────
function pollCallsWithPython(pythonCmd, since) {
  return new Promise((resolve, reject) => {
    const args = [POLL_SCRIPT];
    if (since) args.push(since);
    const proc = spawn(pythonCmd, args, { windowsHide: true });
    let out = '';
    let err = '';
    proc.stdout.on('data', d => { out += d.toString(); });
    proc.stderr.on('data', d => { err += d.toString(); });
    proc.on('close', code => {
      if (code !== 0) return reject(new Error(err || `python exit ${code}`));
      try {
        resolve(JSON.parse(out.trim() || '[]'));
      } catch (e) {
        reject(new Error(`JSON parse: ${e.message} raw=${out.slice(0, 200)}`));
      }
    });
  });
}

let resolvedPython = '';

async function pollCalls(since) {
  const tries = resolvedPython ? [resolvedPython] : PYTHON_CANDIDATES;
  let lastErr;
  for (const cmd of tries) {
    try {
      const rows = await pollCallsWithPython(cmd, since);
      resolvedPython = cmd;
      return rows;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Python 실행 실패');
}

// ── 알림 ──────────────────────────────────────────────────────────
function buildMessages(row, customer) {
  const absence = Number(row.cl_absence) === 1;
  const name = customer.name || null;
  const digits = customer.digits || normalizePhoneDigits(row.cl_caller);
  const displayNum = formatPhoneDisplay(digits) || String(row.cl_caller || '');
  const timeStr = String(row.cl_idate || '');

  let toastBody;
  let kakaoText;

  if (absence) {
    if (name) {
      toastBody = `📵 부재중 - ${name} / ${displayNum}`;
      kakaoText = `📵 부재중 전화\n이름: ${name}\n번호: ${displayNum}\n시간: ${timeStr}`;
    } else {
      toastBody = `📵 부재중 - 고객정보 없음 / ${displayNum}`;
      kakaoText = `📵 부재중 전화\n이름: 고객정보 없음\n번호: ${displayNum}\n시간: ${timeStr}`;
    }
  } else if (name) {
    toastBody = `📞 ${name} / ${displayNum}`;
    kakaoText = `📞 전화 수신\n이름: ${name}\n번호: ${displayNum}\n시간: ${timeStr}`;
  } else {
    toastBody = `📞 고객정보 없음 / ${displayNum}`;
    kakaoText = `📞 전화 수신\n이름: 고객정보 없음\n번호: ${displayNum}\n시간: ${timeStr}`;
  }

  return { toastBody, kakaoText };
}

function showToast(body) {
  if (!NOTIFIER) {
    log(`[토스트 스킵] ${body}`);
    return;
  }
  NOTIFIER.notify({
    title: 'Pitaya OS 전화알림',
    message: body,
    icon: path.join(__dirname, 'icon.ico'),
    sound: true,
    wait: false,
  });
}

function postKakaoMemo(token, templateObject) {
  if (!token) return Promise.resolve();
  const body = new URLSearchParams({
    template_object: JSON.stringify(templateObject),
  }).toString();

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'kapi.kakao.com',
        path: '/v2/api/talk/memo/default/send',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      res => {
        let data = '';
        res.on('data', c => { data += c; });
        res.on('end', () => {
          try {
            const json = JSON.parse(data || '{}');
            if (res.statusCode >= 200 && res.statusCode < 300 && (json.result_code === 0 || json.result_code === undefined)) {
              resolve(json);
            } else {
              reject(new Error(json.msg || json.message || data || `HTTP ${res.statusCode}`));
            }
          } catch {
            reject(new Error(data || `HTTP ${res.statusCode}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

async function notifyStoreWeb(title, message) {
  const mapSnap = await db.collection('user_store_map')
    .where('storeId', '==', STORE_ID)
    .where('status', '==', 'active')
    .get();

  if (mapSnap.empty) {
    log('웹 알림: 활성 매장 사용자 없음');
    return;
  }

  const batch = db.batch();
  const seen = new Set();
  let count = 0;

  for (const doc of mapSnap.docs) {
    const uid = doc.data().uid;
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    batch.set(db.collection('notifications').doc(), {
      targetUid: uid,
      senderUid: '',
      senderName: 'Pitaya OS',
      type: 'phone_call',
      title,
      message,
      link: '/dashboard/customers',
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    count += 1;
  }

  if (count > 0) {
    await batch.commit();
    log(`웹 알림 ${count}명 전송`);
  }
}

async function sendKakao(text) {
  if (!process.env.KAKAO_REST_API_KEY) {
    log('카카오: KAKAO_REST_API_KEY 없음 (.env 확인)');
    return;
  }

  const users = await findKakaoNotifyUsersForStore(STORE_ID);
  if (!users.length) {
    log('카카오: 연동된 매장 사용자 없음 (Pitaya 설정에서 카카오 연동)');
    return;
  }

  const link = { web_url: APP_URL, mobile_web_url: APP_URL };
  const template = {
    object_type: 'text',
    text: text.slice(0, 200),
    link,
    buttons: [{ title: 'Pitaya OS', link }],
  };

  for (const { uid, nick } of users) {
    try {
      const token = await getValidKakaoToken(uid);
      if (!token) {
        log(`카카오 스킵 (${nick}): 토큰 없음`);
        continue;
      }
      await postKakaoMemo(token, template);
      log(`카카오 전송 OK (${nick})`);
    } catch (e) {
      log(`카카오 실패 (${nick}): ${e.message}`);
    }
  }
}

async function handleRow(row, state) {
  const key = rowKey(row);
  if (state.seen.includes(key)) return;
  if (!isIncomingToStore(row)) return;

  const customer = lookupCustomer(row.cl_caller);
  const { toastBody, kakaoText } = buildMessages(row, customer);
  const webTitle = Number(row.cl_absence) === 1 ? '부재중 전화' : '전화 수신';

  log(`알림: ${toastBody}`);
  showToast(toastBody);
  try {
    await notifyStoreWeb(webTitle, toastBody.replace(/^📞 |^📵 /, ''));
  } catch (e) {
    log(`웹 알림 실패: ${e.message}`);
  }
  try {
    await sendKakao(kakaoText);
  } catch (e) {
    log(`카카오 실패: ${e.message}`);
  }

  state.seen.push(key);
  if (row.cl_idate && row.cl_idate > (state.lastIdate || '')) {
    state.lastIdate = String(row.cl_idate);
  }
  saveState(state);
}

// ── 메인 루프 ─────────────────────────────────────────────────────
async function bootstrap(state) {
  const rows = await pollCalls('');
  if (rows.length && rows[0].cl_idate) {
    state.lastIdate = String(rows[0].cl_idate);
    saveState(state);
    log(`시작 watermark: ${state.lastIdate} (기존 통화는 알림 안 함)`);
  }
}

async function tick(state) {
  const since = state.lastIdate || '';
  const rows = await pollCalls(since);
  for (const row of rows) {
    await handleRow(row, state);
  }
}

async function runSelfTest() {
  log('=== 자가 테스트 ===');
  const rows = await pollCalls('');
  log(`KPD.dat 최근 통화: ${rows.length ? JSON.stringify(rows[0]) : '없음'}`);
  initFirebase();
  await refreshCustomerIndex();
  log('Firebase OK');
  const kakaoUsers = await findKakaoNotifyUsersForStore(STORE_ID);
  if (!kakaoUsers.length) {
    log('카카오 연동 사용자 없음 — Pitaya 설정에서 카카오 연동');
  } else {
    log(`카카오 연동 ${kakaoUsers.length}명: ${kakaoUsers.map(u => u.nick).join(', ')}`);
    try {
      await sendKakao('[Pitaya 테스트] 통화매니저 전화 알림 카카오 연동 확인');
      log('카카오 테스트 발송 완료 (각 계정 「나와의 채팅」 확인)');
    } catch (e) {
      log(`카카오 테스트 실패: ${e.message}`);
    }
  }
  try {
    await notifyStoreWeb('테스트', '통화매니저 웹 알림 연동 테스트');
    log('웹 알림 테스트 OK');
  } catch (e) {
    log(`웹 알림 테스트 실패: ${e.message}`);
  }
  log('=== 테스트 완료 ===');
}

async function main() {
  if (process.argv.includes('--test')) {
    log('Pitaya KT Caller (--test)');
    await runSelfTest();
    return;
  }

  if (process.argv.includes('--reset-watermark')) {
    try { fs.unlinkSync(STATE_FILE); log('watermark 초기화됨'); } catch { /* 없음 */ }
  }

  log('Pitaya KT Caller 시작');
  log(`매장 ${STORE_ID} / 수신번호 ${STORE_CALLEE}`);

  if (!fs.existsSync(POLL_SCRIPT)) {
    throw new Error(`폴링 스크립트 없음: ${POLL_SCRIPT}`);
  }

  initFirebase();
  await refreshCustomerIndex();
  setInterval(() => refreshCustomerIndex().catch(e => log(`인덱스 갱신 실패: ${e.message}`)), 10 * 60 * 1000);

  const state = loadState();
  if (!state.lastIdate) {
    await bootstrap(state);
  } else {
    log(`이어서 감시: lastIdate=${state.lastIdate}`);
  }

  await tick(state);
  setInterval(() => tick(loadState()).catch(e => log(`폴링 오류: ${e.message}`)), POLL_MS);
}

if (require.main === module) {
  main().catch(e => {
    console.error(e);
    process.exit(1);
  });
}
