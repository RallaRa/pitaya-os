import { NextResponse } from 'next/server';
import { adminDb, adminStorage } from '@/lib/firebase/admin';

/* ── 내부 헬퍼: 개별 usage API 호출 (서버 내부 직접 임포트) ── */

async function fetchClaude() {
  const monthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  if (!process.env.ANTHROPIC_API_KEY) return null;
  try {
    const doc = await adminDb
      .collection('usage_logs').doc('claude')
      .collection('monthly').doc(monthKey).get();
    const d = doc.exists ? doc.data()! : {};
    return {
      totalTokens:  d.total_tokens  || 0,
      requestCount: d.request_count || 0,
      limit:        1_000_000,
    };
  } catch { return null; }
}

async function fetchGPT() {
  if (!process.env.OPENAI_API_KEY) return null;

  const now = new Date();
  const monthKey  = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const startDate = `${monthKey}-01`;
  const endDate   = now.toISOString().split('T')[0];

  // 1차: OpenAI Billing API
  try {
    const res = await fetch(
      `https://api.openai.com/v1/dashboard/billing/usage?start_date=${startDate}&end_date=${endDate}`,
      {
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (res.ok) {
      const data = await res.json();
      if (typeof data.total_usage === 'number') {
        const costUsd = data.total_usage / 100;
        return { costUsd, budgetUsd: 10, source: 'billing' };
      }
    }
  } catch { /* fall through */ }

  // 2차: Firestore 추정
  try {
    const doc = await adminDb
      .collection('usage_logs').doc('gpt')
      .collection('monthly').doc(monthKey).get();
    const d = doc.exists ? doc.data()! : {};
    const inp = d.input_tokens  || 0;
    const out = d.output_tokens || 0;
    const cost = inp * (2.50 / 1e6) + out * (10.00 / 1e6);
    return { costUsd: Math.round(cost * 1e4) / 1e4, budgetUsd: 10, requestCount: d.request_count || 0, source: 'estimate' };
  } catch { return null; }
}

async function fetchGroq() {
  const monthKey = (() => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  })();
  if (!process.env.GROQ_API_KEY) return null;
  try {
    const doc = await adminDb
      .collection('usage_logs').doc('groq')
      .collection('monthly').doc(monthKey).get();
    const d = doc.exists ? doc.data()! : {};
    return {
      totalTokens:  d.total_tokens  || 0,
      requestCount: d.request_count || 0,
      limit:        1_000_000,
    };
  } catch { return null; }
}

async function fetchDrive() {
  const { GoogleAuth } = await import('google-auth-library');
  const keyStr = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  let token: string | null = process.env.GOOGLE_DRIVE_ACCESS_TOKEN || null;

  if (!token && keyStr) {
    try {
      const auth = new GoogleAuth({
        credentials: JSON.parse(keyStr),
        scopes: ['https://www.googleapis.com/auth/drive.metadata.readonly'],
      });
      const client = await auth.getClient();
      const t = await (client as any).getAccessToken();
      token = t?.token || t?.access_token || null;
    } catch { /* ignore */ }
  }

  if (!token) return null;

  try {
    const res = await fetch(
      'https://www.googleapis.com/drive/v3/about?fields=storageQuota',
      { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(6000) },
    );
    if (!res.ok) return null;
    const data = await res.json();
    const q = data.storageQuota || {};
    const usageBytes = parseInt(q.usage || '0', 10);
    const limitBytes = parseInt(q.limit || '0', 10);
    return {
      usageGB: Math.round((usageBytes / 1024 ** 3) * 100) / 100,
      limitGB: limitBytes > 0 ? Math.round((limitBytes / 1024 ** 3) * 100) / 100 : 15,
      source: 'drive_api',
    };
  } catch { return null; }
}

async function fetchFirebaseStorage() {
  try {
    const bucket = adminStorage.bucket();
    const [files] = await bucket.getFiles({ maxResults: 1000 });
    let totalBytes = 0;
    files.forEach(f => { totalBytes += parseInt(String(f.metadata.size || '0'), 10); });
    return { bytes: totalBytes, fileCount: files.length };
  } catch { return null; }
}

async function fetchGeminiStats() {
  const now = new Date();
  const dayKey   = now.toISOString().split('T')[0];
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  try {
    const doc = await adminDb.collection('usage_stats').doc('global').get();
    if (!doc.exists) return { daily: 0, monthly: 0 };
    const data = doc.data()!;
    return {
      daily:   data[`day_${dayKey}`]?.gemini_requests   || 0,
      monthly: data[`month_${monthKey}`]?.gemini_requests || 0,
    };
  } catch { return { daily: 0, monthly: 0 }; }
}

async function fetchFirestoreStats() {
  const dk = new Date().toISOString().split('T')[0];
  try {
    const doc = await adminDb.collection('usage_stats').doc('global').get();
    if (!doc.exists) return { reads: 0, writes: 0 };
    const d = doc.data()!;
    return {
      reads:  d[`day_${dk}`]?.fs_reads  || 0,
      writes: d[`day_${dk}`]?.fs_writes || 0,
    };
  } catch { return { reads: 0, writes: 0 }; }
}

async function fetchVercelDeploys() {
  const token = process.env.VERCEL_TOKEN;
  if (!token) return null;

  const now = new Date();
  const since = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

  try {
    const res = await fetch(
      `https://api.vercel.com/v6/deployments?limit=100&since=${since}`,
      {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(6000),
      },
    );
    if (!res.ok) return null;
    const data = await res.json();
    return { count: (data.deployments || []).length, limit: 100 };
  } catch { return null; }
}

export async function GET() {
  const [claude, gpt, groq, drive, storage, gemini, fsStats, vercel] = await Promise.all([
    fetchClaude(),
    fetchGPT(),
    fetchGroq(),
    fetchDrive(),
    fetchFirebaseStorage(),
    fetchGeminiStats(),
    fetchFirestoreStats(),
    fetchVercelDeploys(),
  ]);

  const services = [
    {
      id:        'gemini',
      name:      'Gemini 2.5 Flash',
      provider:  'Google',
      emoji:     '⚡',
      used:      gemini.daily,
      limit:     1500,
      unit:      '요청',
      period:    '일',
      available: !!process.env.GEMINI_API_KEY,
      note:      `이번달 총 ${gemini.monthly}건`,
    },
    {
      id:        'claude',
      name:      'Claude Sonnet',
      provider:  'Anthropic',
      emoji:     '🧠',
      used:      claude?.totalTokens ?? 0,
      limit:     claude?.limit ?? 1_000_000,
      unit:      '토큰',
      period:    '월',
      available: !!process.env.ANTHROPIC_API_KEY,
      note:      claude ? `${claude.requestCount}건 호출 · Firestore 누적` : '데이터 없음',
      realtime:  false,
    },
    {
      id:        'gpt',
      name:      'GPT-4o',
      provider:  'OpenAI',
      emoji:     '👔',
      used:      gpt ? Math.round((gpt.costUsd / gpt.budgetUsd) * 100) : 0,
      limit:     100,
      unit:      '%',
      period:    '월',
      available: !!process.env.OPENAI_API_KEY,
      note:      gpt
        ? `$${gpt.costUsd.toFixed(4)} / $${gpt.budgetUsd} · ${gpt.source === 'billing' ? '실시간' : '추정'}`
        : '데이터 없음',
      realtime:  gpt?.source === 'billing',
      rawCost:   gpt?.costUsd,
      rawBudget: gpt?.budgetUsd,
    },
    {
      id:        'groq',
      name:      'Groq',
      provider:  'Groq',
      emoji:     '🚀',
      used:      groq?.totalTokens ?? 0,
      limit:     groq?.limit ?? 1_000_000,
      unit:      '토큰',
      period:    '월',
      available: !!process.env.GROQ_API_KEY,
      note:      groq ? `${groq.requestCount}건 호출 · Firestore 누적` : '데이터 없음',
      realtime:  false,
    },
    {
      id:        'firestore',
      name:      'Firestore',
      provider:  'Firebase',
      emoji:     '🔥',
      used:      fsStats.reads,
      limit:     50000,
      unit:      '읽기',
      period:    '일',
      available: true,
      note:      `쓰기 ${fsStats.writes}건`,
    },
    {
      id:        'storage',
      name:      drive ? 'Google Drive' : 'Firebase Storage',
      provider:  'Firebase',
      emoji:     '🗄️',
      used:      drive
        ? drive.usageGB
        : storage ? Math.round(storage.bytes / 1024 / 1024) : null,
      limit:     drive ? drive.limitGB : 1024,
      unit:      drive ? 'GB' : 'MB',
      period:    '누적',
      available: !!(drive || storage),
      note:      drive
        ? `Drive API 실조회 · ${drive.usageGB}GB / ${drive.limitGB}GB`
        : storage ? `${storage.fileCount}개 파일 · Firebase Storage` : 'Storage 미활성화',
      realtime:  !!(drive || storage),
    },
    {
      id:        'vercel',
      name:      'Vercel',
      provider:  'Vercel',
      emoji:     '▲',
      used:      vercel?.count ?? null,
      limit:     vercel?.limit ?? 100,
      unit:      '배포',
      period:    '월',
      available: !!process.env.VERCEL_TOKEN,
      note:      vercel ? `이번달 ${vercel.count}회 배포` : 'VERCEL_TOKEN 미설정',
      realtime:  !!vercel,
    },
  ];

  return NextResponse.json({ services, updatedAt: new Date().toISOString() });
}
