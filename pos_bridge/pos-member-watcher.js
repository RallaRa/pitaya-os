/**
 * Pitaya OS — POS 회원호출 감지 → 고객 요청 이력 토스트
 * C:\pitaya-bridge\pos-member-watcher.js
 *
 * npm install node-notifier dotenv axios firebase-admin
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const axios = require('axios');

function log(msg) {
  console.log(`[${new Date().toLocaleString('ko-KR', { timeZone: 'Asia/Seoul' })}] ${msg}`);
}

const ENV_PATHS = [
  'C:\\pitaya-bridge\\.env',
  path.join(__dirname, '.env'),
  'C:\\pitaya-os\\.env',
];
for (const envPath of ENV_PATHS) {
  if (fs.existsSync(envPath)) require('dotenv').config({ path: envPath, override: true });
}

const NOTIFIER = (() => {
  try { return require('node-notifier'); } catch { return null; }
})();

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');

const STORE_ID = process.env.STORE_ID || 'STR-1779194754785';
const API_KEY = process.env.POS_BRIDGE_KEY || '';
const APP_URL = (process.env.PITAYA_APP_URL || 'https://pitaya-osv1.vercel.app').replace(/\/$/, '');
const POLL_MS = parseInt(process.env.MEMBER_WATCH_MS || '2000', 10);
const COOLDOWN_MS = parseInt(process.env.MEMBER_WATCH_COOLDOWN_MS || '600000', 10);
const STATE_FILE = path.join(__dirname, 'pos-member-watcher-state.json');
const PROBE_SCRIPT = path.join(__dirname, 'probe-pos-member-screen.ps1');

let db;
let polling = false;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch { return { lastCusCode: '', lastNotifyAt: 0 }; }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function initFirebase() {
  if (admin.apps.length) {
    db = admin.firestore();
    return;
  }
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!raw) return;
  try {
    const sa = JSON.parse(raw);
    admin.initializeApp({ credential: admin.credential.cert(sa) });
    db = admin.firestore();
  } catch (e) {
    log(`Firebase 초기화 실패: ${e.message}`);
  }
}

function probePosMember() {
  return new Promise(resolve => {
    if (!fs.existsSync(PROBE_SCRIPT)) {
      resolve({ running: false, error: 'probe script missing' });
      return;
    }
    const ps = spawn('powershell.exe', [
      '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', PROBE_SCRIPT,
    ], { cwd: __dirname, windowsHide: true });

    let out = '';
    ps.stdout.on('data', d => { out += d.toString(); });
    ps.on('close', () => {
      try {
        const line = out.trim().split('\n').pop();
        resolve(JSON.parse(line || '{}'));
      } catch {
        resolve({ running: false });
      }
    });
    ps.on('error', () => resolve({ running: false }));
  });
}

async function fetchMemberRequests(cusCode) {
  const res = await axios.get(`${APP_URL}/api/pos/customer-requests`, {
    params: { storeId: STORE_ID, cusCode, limit: 3 },
    headers: { Authorization: `Bearer ${API_KEY}` },
    timeout: 15000,
  });
  return res.data;
}

function formatDateShort(ymd) {
  if (!ymd || ymd.length < 10) return '';
  return `${ymd.slice(5, 7)}/${ymd.slice(8, 10)}`;
}

function buildToastMessages(data, screenName) {
  const name = data.customerName || screenName || data.cusCode;
  const header = `👤 ${name} (${data.cusCode})`;
  const lines = [header];

  if (!data.requests?.length) {
    lines.push('등록된 요청 이력 없음');
  } else {
    for (const r of data.requests) {
      const dt = formatDateShort(r.requestDate);
      const txt = String(r.content || '').replace(/\s+/g, ' ').trim().slice(0, 36);
      const attach = r.attachmentCount > 0 ? ` 📎${r.attachmentCount}` : '';
      lines.push(`· ${dt} ${txt}${attach}`);
    }
  }

  return {
    title: 'Pitaya 회원 요청 이력',
    body: lines.join('\n').slice(0, 240),
    summary: lines.slice(1).join(' · ').slice(0, 120),
  };
}

function showToast(title, body) {
  if (!NOTIFIER) {
    log(`[토스트] ${title}\n${body}`);
    return;
  }
  NOTIFIER.notify({
    title,
    message: body,
    icon: path.join(__dirname, 'icon.ico'),
    sound: true,
    wait: false,
  });
}

async function notifyStoreWeb(title, message, cusCode) {
  if (!db) return;
  const mapSnap = await db.collection('user_store_map')
    .where('storeId', '==', STORE_ID)
    .where('status', '==', 'active')
    .get();
  if (mapSnap.empty) return;

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
      type: 'pos_member_comment',
      title,
      message,
      link: `/dashboard/customers?cusCode=${encodeURIComponent(cusCode)}`,
      isRead: false,
      createdAt: FieldValue.serverTimestamp(),
    });
    count += 1;
  }

  if (count > 0) {
    await batch.commit();
    log(`웹 알림 ${count}명`);
  }
}

async function handleMember(cusCode, screenName) {
  const state = loadState();
  const now = Date.now();

  if (cusCode === state.lastCusCode && now - (state.lastNotifyAt || 0) < COOLDOWN_MS) {
    return;
  }

  let data;
  try {
    data = await fetchMemberRequests(cusCode);
  } catch (e) {
    log(`API 조회 실패 [${cusCode}]: ${e.message}`);
    return;
  }

  const { title, body, summary } = buildToastMessages(data, screenName);
  log(`회원 감지: ${cusCode} | ${data.requestCount}건`);
  showToast(title, body);
  await notifyStoreWeb(title, summary || body.replace(/\n/g, ' '), cusCode);

  state.lastCusCode = cusCode;
  state.lastNotifyAt = now;
  saveState(state);
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const probe = await probePosMember();
    if (!probe.running) return;

    const cusCode = String(probe.cusCode || '').trim();
    if (!cusCode) {
      const state = loadState();
      if (state.lastCusCode) {
        state.lastCusCode = '';
        saveState(state);
      }
      return;
    }

    await handleMember(cusCode, String(probe.memberName || '').trim());
  } finally {
    polling = false;
  }
}

async function main() {
  if (!API_KEY) {
    log('POS_BRIDGE_KEY 미설정 (.env 확인)');
    process.exit(1);
  }
  if (!fs.existsSync(PROBE_SCRIPT)) {
    log(`probe 스크립트 없음: ${PROBE_SCRIPT}`);
    process.exit(1);
  }

  initFirebase();
  log(`POS 회원 감시 시작 | store=${STORE_ID} | poll=${POLL_MS}ms | cooldown=${COOLDOWN_MS / 1000}s`);

  await pollOnce();
  setInterval(pollOnce, POLL_MS);
}

main().catch(e => {
  log(`치명적 오류: ${e.message}`);
  process.exit(1);
});
