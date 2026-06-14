/**
 * Pitaya OS — POS 결제(판매등록) 화면 회원 입력 감지
 * - 평문 전화번호 → Pitaya sync + public_order 재매칭
 * - 회원 요청 이력 토스트
 * C:\pitaya-bridge\pos-member-watcher.js
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

const admin = (() => {
  try { return require('firebase-admin'); } catch { return null; }
})();
const { FieldValue } = admin ? require('firebase-admin/firestore') : { FieldValue: null };

const STORE_ID = process.env.STORE_ID || 'STR-1779194754785';
const API_KEY = process.env.POS_BRIDGE_KEY || '';
const APP_URL = (process.env.PITAYA_APP_URL || 'https://pitaya-osv1.vercel.app').replace(/\/$/, '');
const POLL_MS = parseInt(process.env.MEMBER_WATCH_MS || '2000', 10);
const COOLDOWN_MS = parseInt(process.env.MEMBER_WATCH_COOLDOWN_MS || '600000', 10);
const SYNC_COOLDOWN_MS = parseInt(process.env.MEMBER_SYNC_COOLDOWN_MS || String(6 * 60 * 60 * 1000), 10);
const STATE_FILE = path.join(__dirname, 'pos-member-watcher-state.json');
const UI_SCRAPED_CSV = path.join(__dirname, 'ui-scraped-phones.csv');
const PROBE_SCRIPT = path.join(__dirname, 'probe-pos-member-screen.ps1');

/** POS 화면에서 PowerShell 창이 깜빡이지 않도록 항상 숨김 실행 */
const PS_HIDDEN_ARGS = ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-ExecutionPolicy', 'Bypass'];
const PS_HIDDEN_SPAWN = { cwd: __dirname, windowsHide: true };

let db;
let polling = false;

function loadState() {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')); }
  catch {
    return { lastCusCode: '', lastNotifyAt: 0, lastSync: {}, onPaymentScreen: false };
  }
}

function saveState(state) {
  fs.writeFileSync(STATE_FILE, JSON.stringify(state, null, 2), 'utf8');
}

function normalizePhone(raw) {
  if (raw && typeof raw === 'object') return '';
  const digits = String(raw || '').replace(/\D/g, '');
  if (/^010\d{8}$/.test(digits)) return digits;
  return '';
}

function normalizeCusCode(raw) {
  if (raw && typeof raw === 'object') return '';
  const code = String(raw || '').trim();
  if (/^98\d{6}$/.test(code)) return code;
  if (/^\d{8}$/.test(code)) return code;
  return '';
}

function initFirebase() {
  if (!admin) {
    log('firebase-admin 미설치 — 웹 알림만 생략 (POS 토스트는 계속 동작)');
    return;
  }
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
      ...PS_HIDDEN_ARGS, '-File', PROBE_SCRIPT,
    ], {
      ...PS_HIDDEN_SPAWN,
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    ps.stdout.on('data', d => { out += d.toString(); });
    let err = '';
    ps.stderr.on('data', d => { err += d.toString(); });
    ps.on('close', code => {
      try {
        const line = out.trim().split('\n').filter(Boolean).pop() || '';
        if (!line.startsWith('{')) {
          resolve({
            running: false,
            error: err.trim() || out.trim().slice(0, 200) || `probe exit ${code}`,
          });
          return;
        }
        resolve(JSON.parse(line));
      } catch (e) {
        resolve({
          running: false,
          error: e.message || err.trim() || out.trim().slice(0, 200),
        });
      }
    });
    ps.on('error', () => resolve({ running: false }));
  });
}

function appendUiScrapedPhone(cusCode, phone) {
  try {
    if (!fs.existsSync(UI_SCRAPED_CSV)) {
      fs.writeFileSync(UI_SCRAPED_CSV, 'scraped_at,cus_code_hint,phone\r\n', 'utf8');
    }
    const line = `${new Date().toISOString()},${cusCode},${phone}\r\n`;
    fs.appendFileSync(UI_SCRAPED_CSV, line, 'utf8');
  } catch (e) {
    log(`CSV 저장 실패: ${e.message}`);
  }
}

function shouldSyncPhone(state, cusCode, phone) {
  const key = `${cusCode}:${phone}`;
  const lastAt = state.lastSync?.[key] || 0;
  return Date.now() - lastAt >= SYNC_COOLDOWN_MS;
}

function markSynced(state, cusCode, phone) {
  if (!state.lastSync) state.lastSync = {};
  state.lastSync[`${cusCode}:${phone}`] = Date.now();
  const keys = Object.keys(state.lastSync);
  if (keys.length > 500) {
    const sorted = keys.sort((a, b) => (state.lastSync[a] || 0) - (state.lastSync[b] || 0));
    for (const k of sorted.slice(0, keys.length - 400)) delete state.lastSync[k];
  }
}

async function syncCustomerScreen(cusCode, phone, memberName, source = 'pos_payment_screen') {
  const res = await axios.post(
    `${APP_URL}/api/pos/sync-customer-screen`,
    {
      storeId: STORE_ID,
      cusCode,
      phoneFull: phone,
      memberName: memberName || undefined,
      source,
      rematch: true,
      syncedAt: new Date().toISOString(),
    },
    {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 20000,
    },
  );
  return res.data;
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

function maskPhone(phone) {
  if (!phone || phone.length < 11) return '미감지';
  return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
}

function buildToastMessages(data, screenName, opts = {}) {
  const name = data.customerName || screenName || data.cusCode;
  const header = `👤 ${name} (${data.cusCode})`;
  const lines = [header];

  if (opts.phone) {
    lines.push(`📞 ${maskPhone(opts.phone)}`);
  } else {
    lines.push('📞 전화 OCR 중…');
  }
  if (opts.syncNote) lines.push(opts.syncNote);

  if (!data.requests?.length) {
    lines.push('요청 이력 없음');
  } else {
    for (const r of data.requests) {
      const dt = formatDateShort(r.requestDate);
      const txt = String(r.content || '').replace(/\s+/g, ' ').trim().slice(0, 36);
      const attach = r.attachmentCount > 0 ? ` 📎${r.attachmentCount}` : '';
      lines.push(`· ${dt} ${txt}${attach}`);
    }
  }

  return {
    title: 'Pitaya 회원',
    body: lines.join('\n').slice(0, 240),
    summary: lines.slice(1).join(' · ').slice(0, 120),
    webMessage: lines.join('\n').slice(0, 480),
  };
}

function showToast(title, body) {
  log(`[토스트] ${title}\n${body}`);
  const toastScript = path.join(__dirname, 'show-pitaya-toast.ps1');
  if (!fs.existsSync(toastScript)) {
    if (NOTIFIER) {
      try {
        NOTIFIER.notify({ title, message: body, sound: true, wait: false, timeout: 12 });
      } catch (e) {
        log(`토스트 표시 실패: ${e.message}`);
      }
    }
    return;
  }
  const bodyFile = path.join(__dirname, '.pitaya-toast-body.txt');
  try {
    fs.writeFileSync(bodyFile, body, 'utf8');
  } catch (e) {
    log(`토스트 body 저장 실패: ${e.message}`);
    return;
  }
  spawn('powershell.exe', [
    ...PS_HIDDEN_ARGS,
    '-File', toastScript,
    '-Title', title,
    '-BodyFile', bodyFile,
  ], {
    ...PS_HIDDEN_SPAWN,
    detached: true,
    stdio: 'ignore',
  }).unref();
}

async function notifyStoreWeb(title, message, cusCode) {
  if (!db || !FieldValue) return;
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
      link: `/dashboard/customers?cusCode=${encodeURIComponent(cusCode)}&openRequests=1`,
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

async function handlePhoneSync(cusCode, phone, memberName, source = 'pos_payment_screen') {
  const state = loadState();
  if (!shouldSyncPhone(state, cusCode, phone)) return null;

  try {
    appendUiScrapedPhone(cusCode, phone);
    const data = await syncCustomerScreen(cusCode, phone, memberName, source);
    markSynced(state, cusCode, phone);
    saveState(state);

    const rematch = data.rematch || {};
    const note = `Pitaya 반영됨 (${data.phoneOutcome || 'ok'})`;
    log(
      `전화 sync: ${cusCode} ${phone.slice(0, 3)}****${phone.slice(-4)} ` +
      `| phone=${data.phoneOutcome || '?'} rematch=${rematch.matched || 0}/${rematch.scanned || 0}`,
    );
    return note;
  } catch (e) {
    const msg = e.response?.data?.error || e.message;
    log(`전화 sync 실패 [${cusCode}]: ${msg}`);
    return `sync 실패: ${String(msg).slice(0, 40)}`;
  }
}

async function handleMemberNotify(cusCode, screenName, phone, syncNote) {
  const state = loadState();
  const now = Date.now();

  if (cusCode === state.lastCusCode && now - (state.lastNotifyAt || 0) < COOLDOWN_MS) {
    return;
  }

  let data = {
    cusCode,
    customerName: screenName || '',
    requestCount: 0,
    requests: [],
  };
  try {
    data = await fetchMemberRequests(cusCode);
  } catch (e) {
    log(`API 조회 실패 [${cusCode}]: ${e.message} (로컬 정보로 토스트)`);
  }

  const { title, body, webMessage } = buildToastMessages(data, screenName, {
    phone,
    syncNote,
  });
  log(`결제화면 회원 입력: ${cusCode} | ${data.requestCount}건 | phone=${phone || 'none'}`);
  showToast(title, body);
  await notifyStoreWeb(title, webMessage || body, cusCode);

  state.lastCusCode = cusCode;
  state.lastNotifyAt = now;
  saveState(state);
}

async function pollOnce() {
  if (polling) return;
  polling = true;
  try {
    const probe = await probePosMember();
    if (!probe.running) {
      if (!probe._failLogged || Date.now() - probe._failLogged > 120000) {
        probe._failLogged = Date.now();
        const reason = probe.error || 'POS 미실행 또는 probe 실패';
        log(`POS probe 실패: ${reason}`);
      }
      return;
    }

    const state = loadState();
    const onPayment = probe.isPaymentScreen === true;
    const onLookup = probe.isMemberLookupScreen === true;

    if (!onPayment && !onLookup) {
      if (state.onPaymentScreen || state.lastCusCode) {
        state.onPaymentScreen = false;
        state.lastCusCode = '';
        saveState(state);
      }
      if (!probe._skipLogged || Date.now() - probe._skipLogged > 120000) {
        probe._skipLogged = Date.now();
        const cus = normalizeCusCode(probe.cusCode);
        if (cus) {
          log(`기타 화면 — 결제/회원조회 화면만 수집 (${cus} 무시)`);
        }
      }
      return;
    }

    state.onPaymentScreen = onPayment;
    saveState(state);

    const cusCode = normalizeCusCode(probe.cusCode);
    const memberName = typeof probe.memberName === 'string' ? probe.memberName.trim() : '';
    const phone = normalizePhone(probe.phone);

    if (!cusCode) {
      if (state.lastCusCode) {
        state.lastCusCode = '';
        saveState(state);
      }
      if (!probe._emptyLogged || Date.now() - probe._emptyLogged > 60000) {
        probe._emptyLogged = Date.now();
        const screen = onPayment ? '결제' : '회원조회';
        log(`${screen}화면 — 회원번호/전화 대기 중`);
      }
      return;
    }

    /* 회원조회 건별 검색: 전화만 sync (토스트 생략) */
    if (onLookup && !onPayment) {
      if (phone) {
        await handlePhoneSync(cusCode, phone, memberName, 'pos_member_lookup_screen');
        log(`회원조회 화면 전화 sync: ${cusCode} ${phone.slice(0, 3)}****${phone.slice(-4)}`);
      } else if (!probe._lookupNoPhone || Date.now() - probe._lookupNoPhone > 60000) {
        probe._lookupNoPhone = Date.now();
        log(`회원조회 화면 — ${cusCode} 전화 OCR/스크랩 실패`);
      }
      return;
    }

    let syncNote = '';
    if (phone) {
      syncNote = (await handlePhoneSync(cusCode, phone, memberName, 'pos_payment_screen')) || '';
    }

    await handleMemberNotify(cusCode, memberName, phone, syncNote);
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
  log(
    `POS 결제화면 회원 감시 | store=${STORE_ID} | poll=${POLL_MS}ms ` +
    `| notifyCooldown=${COOLDOWN_MS / 1000}s | syncCooldown=${SYNC_COOLDOWN_MS / 1000}s`,
  );

  await pollOnce();
  setInterval(pollOnce, POLL_MS);
}

main().catch(e => {
  log(`치명적 오류: ${e.message}`);
  process.exit(1);
});
