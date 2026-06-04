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

require('dotenv').config({ path: path.join(__dirname, '.env') });

const NOTIFIER = (() => {
  try {
    return require('node-notifier');
  } catch {
    return null;
  }
})();

const admin = require('firebase-admin');

const STORE_ID = process.env.STORE_ID || 'STR-1779194754785';
const STORE_CALLEE = normalizePhoneDigits(process.env.KT_STORE_PHONE || '0226629592');
const POLL_MS = parseInt(process.env.KT_POLL_MS || '3000', 10);
const STATE_FILE = path.join(__dirname, 'kt-caller-state.json');
const POLL_SCRIPT = path.join(__dirname, 'kt-caller-poll.py');
const PYTHON = process.env.PYTHON_CMD || 'python';
const APP_URL = (process.env.PITAYA_APP_URL || 'https://pitaya-osv1.vercel.app').replace(/\/$/, '');

const ALGORITHM = 'aes-256-gcm';

// ── 유틸 ──────────────────────────────────────────────────────────
function log(msg) {
  console.log(`[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${msg}`);
}

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

async function refreshCustomerIndex() {
  phoneIndex.clear();
  const snap = await db.collection('pos_customers').where('storeId', '==', STORE_ID).get();
  for (const doc of snap.docs) {
    const data = doc.data();
    let digits = '';
    if (data.phone) {
      digits = normalizePhoneDigits(data.phone);
    }
    if (!digits && data.phoneEncrypted) {
      digits = normalizePhoneDigits(decryptText(String(data.phoneEncrypted)));
    }
    if (!digits) continue;
    let name = '';
    if (data.name) name = String(data.name);
    else if (data.nameEncrypted) name = decryptText(String(data.nameEncrypted));
    if (!name && data.cusName) name = String(data.cusName);
    phoneIndex.set(digits, name || '고객');
    if (digits.length === 11) phoneIndex.set(digits.slice(1), name || '고객');
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
function pollCalls(since) {
  return new Promise((resolve, reject) => {
    const args = [POLL_SCRIPT];
    if (since) args.push(since);
    const proc = spawn(PYTHON, args, { windowsHide: true });
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

function postKakaoMemo(templateObject) {
  const token = process.env.KAKAO_ACCESS_TOKEN;
  if (!token) {
    log('KAKAO_ACCESS_TOKEN 없음 — 카카오 알림 스킵');
    return Promise.resolve();
  }
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

async function sendKakao(text) {
  const link = { web_url: APP_URL, mobile_web_url: APP_URL };
  await postKakaoMemo({
    object_type: 'text',
    text: text.slice(0, 200),
    link,
    buttons: [{ title: 'Pitaya OS', link }],
  });
}

async function handleRow(row, state) {
  const key = rowKey(row);
  if (state.seen.includes(key)) return;
  if (!isIncomingToStore(row)) return;

  const customer = lookupCustomer(row.cl_caller);
  const { toastBody, kakaoText } = buildMessages(row, customer);

  log(`알림: ${toastBody}`);
  showToast(toastBody);
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

async function main() {
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

main().catch(e => {
  console.error(e);
  process.exit(1);
});
