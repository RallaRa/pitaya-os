#!/usr/bin/env node
/**
 * 본대로 토큰 설정
 *   node scripts/setup-bondaero-token.js                 # Chrome refreshToken → .env + Firestore
 *   node scripts/setup-bondaero-token.js "eyJ..."        # access token도 함께 등록
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const ENV_FILE = path.join(ROOT, '.env.local');
const IDB_DIR = path.join(
  os.homedir(),
  'Library/Application Support/Google/Chrome/Default/IndexedDB/https_www.bondaero.kr_0.indexeddb.leveldb',
);

function readChromeRefreshToken() {
  if (!fs.existsSync(IDB_DIR)) return '';
  const blob = fs.readdirSync(IDB_DIR)
    .filter((f) => fs.statSync(path.join(IDB_DIR, f)).isFile())
    .reduce((acc, f) => Buffer.concat([acc, fs.readFileSync(path.join(IDB_DIR, f))]), Buffer.alloc(0));
  const text = blob.toString('utf8', 'ignore');
  const m = text.match(/refreshToken[^A-Za-z0-9._-]*([A-Za-z0-9._-]{20,})/);
  return m?.[1] || '';
}

function upsertEnv(key, value) {
  let content = fs.existsSync(ENV_FILE) ? fs.readFileSync(ENV_FILE, 'utf8') : '';
  const re = new RegExp(`^${key}=.*$`, 'm');
  const line = `${key}="${value.replace(/"/g, '\\"')}"`;
  content = re.test(content) ? content.replace(re, line) : `${content.trimEnd()}\n${line}\n`;
  fs.writeFileSync(ENV_FILE, content.endsWith('\n') ? content : `${content}\n`);
}

function setVercelEnv(key, value) {
  const add = spawnSync('vercel', ['env', 'add', key, 'production', '--value', value, '--yes'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (add.status === 0) return true;
  const out = `${add.stderr || ''}${add.stdout || ''}`;
  if (out.includes('already exists')) {
    spawnSync('vercel', ['env', 'rm', key, 'production', '--yes'], { cwd: ROOT, stdio: 'ignore' });
    const retry = spawnSync('vercel', ['env', 'add', key, 'production', '--value', value, '--yes'], {
      cwd: ROOT,
      encoding: 'utf8',
    });
    return retry.status === 0;
  }
  console.warn(out.trim());
  return false;
}

async function verifyAccessToken(token) {
  const axios = require(path.join(ROOT, 'scraper/node_modules/axios'));
  const res = await axios.post(
    'https://api.bondaero.kr/products/hanwoo/list',
    { filter: null, sort: 'r', page: 0, size: 2, sortOrder: 'ed', coldCondition: 'f' },
    {
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'BDR-User-Agent': 'bondaero.kr/web',
        'User-Agent': 'Mozilla/5.0',
      },
      validateStatus: () => true,
      timeout: 20000,
    },
  );
  const body = res.data?.body ?? res.data;
  const count = body?.content?.length ?? 0;
  return { ok: res.status === 200 && count > 0, status: res.status, count };
}

async function saveFirestoreTokens(tokens) {
  require('dotenv').config({ path: ENV_FILE });
  const { getDb } = require(path.join(ROOT, 'scraper/firestore-upload'));
  await getDb().collection('scraper_sources').doc('bondaero').set(tokens, { merge: true });
}

async function main() {
  const accessArg = process.argv[2]?.trim();
  const refresh = readChromeRefreshToken();

  if (refresh) {
    upsertEnv('BONDAERO_REFRESH_TOKEN', refresh);
    console.log('✅ .env.local ← BONDAERO_REFRESH_TOKEN');
    if (setVercelEnv('BONDAERO_REFRESH_TOKEN', refresh)) {
      console.log('✅ Vercel Production ← BONDAERO_REFRESH_TOKEN');
    }
    await saveFirestoreTokens({ bondaeroRefreshToken: refresh });
    console.log('✅ Firestore scraper_sources/bondaero ← refreshToken');
  } else {
    console.warn('Chrome 본대로 refreshToken 없음 — bondaero.kr 로그인 후 다시 실행');
  }

  if (accessArg) {
    const check = await verifyAccessToken(accessArg);
    if (!check.ok) {
      console.error(`access token 검증 실패 (HTTP ${check.status})`);
      process.exit(1);
    }
    upsertEnv('BONDAERO_ACCESS_TOKEN', accessArg);
    console.log(`✅ .env.local ← BONDAERO_ACCESS_TOKEN (샘플 ${check.count}건)`);
    if (setVercelEnv('BONDAERO_ACCESS_TOKEN', accessArg)) {
      console.log('✅ Vercel Production ← BONDAERO_ACCESS_TOKEN');
    }
    await saveFirestoreTokens({ bondaeroAccessToken: accessArg });
    console.log('✅ Firestore scraper_sources/bondaero ← accessToken');
    return;
  }

  if (!refresh) {
    console.log('\naccess token 수동 등록:');
    console.log('  1) bondaero.kr 로그인 → DevTools → Network → products/hanwoo/list');
    console.log('  2) Authorization: Bearer eyJ... 값 복사');
    console.log('  3) node scripts/setup-bondaero-token.js "eyJ..."');
    console.log('또는 대시보드 → 스크래핑 소스 관리 → 본대로 → API 토큰 저장');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
