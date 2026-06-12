const DEFAULT_API = 'https://pitaya-osv1.vercel.app';

const apiUrlEl = document.getElementById('apiUrl');
const linkCodeEl = document.getElementById('linkCode');
const connectBtn = document.getElementById('connectBtn');
const msgEl = document.getElementById('msg');

function showMsg(text, ok) {
  msgEl.textContent = text;
  msgEl.className = ok ? 'msg ok' : 'msg err';
}

async function loadSettings() {
  const stored = await chrome.storage.sync.get(['apiUrl']);
  apiUrlEl.value = stored.apiUrl || DEFAULT_API;
}

async function saveSettings() {
  await chrome.storage.sync.set({ apiUrl: apiUrlEl.value.trim() || DEFAULT_API });
}

async function collectHometaxCookies() {
  const domains = ['hometax.go.kr', '.hometax.go.kr', 'www.hometax.go.kr'];
  const seen = new Set();
  const cookies = [];

  for (const domain of domains) {
    const list = await chrome.cookies.getAll({ domain });
    for (const c of list) {
      const key = `${c.name}@${c.domain}${c.path}`;
      if (seen.has(key)) continue;
      seen.add(key);
      cookies.push({
        name: c.name,
        value: c.value,
        domain: c.domain.startsWith('.') ? c.domain : `.${c.domain.replace(/^\./, '')}`,
        path: c.path || '/',
      });
    }
  }

  return cookies;
}

connectBtn.addEventListener('click', async () => {
  const linkCode = linkCodeEl.value.trim().toUpperCase();
  const apiUrl = (apiUrlEl.value.trim() || DEFAULT_API).replace(/\/$/, '');

  if (!/^[A-Z0-9]{4,8}$/.test(linkCode)) {
    showMsg('연결 코드 4~8자를 입력하세요.', false);
    return;
  }

  connectBtn.disabled = true;
  showMsg('쿠키 수집 중…', true);

  try {
    await saveSettings();
    const cookies = await collectHometaxCookies();

    if (cookies.length < 2) {
      showMsg('홈택스 쿠키를 찾지 못했습니다. hometax.go.kr 에 로그인했는지 확인하세요.', false);
      return;
    }

    const res = await fetch(`${apiUrl}/api/purchases/hometax/session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ linkCode, cookies }),
    });

    const data = await res.json();
    if (!res.ok) {
      showMsg(data.error || '연결 실패', false);
      return;
    }

    showMsg(`연결 완료 — ${data.cookieCount}개 쿠키 저장됨`, true);
    linkCodeEl.value = '';
  } catch (e) {
    showMsg(e instanceof Error ? e.message : '네트워크 오류', false);
  } finally {
    connectBtn.disabled = false;
  }
});

loadSettings();
