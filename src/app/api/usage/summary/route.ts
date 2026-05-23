import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { getStorage } from 'firebase-admin/storage';
import { getApps } from 'firebase-admin/app';

/* ── 서비스별 월 한도 (무료/기본 플랜 기준) ── */
const LIMITS = {
  gemini:  { requests: 1500,   label: '요청/일', daily: true  },
  claude:  { tokens: 200000,   label: '토큰/월', daily: false },
  gpt:     { tokens: 500000,   label: '토큰/월', daily: false },
  groq:    { tokens: 500000,   label: '토큰/일', daily: true  },
  groq_mixtral: { tokens: 500000, label: '토큰/일', daily: true },
  firestore_reads:  { count: 50000,  label: '읽기/일',  daily: true  },
  firestore_writes: { count: 20000,  label: '쓰기/일',  daily: true  },
  storage: { bytes: 1073741824, label: 'GB', daily: false },
};

async function getAiUsageStats() {
  const now = new Date();
  const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const dayKey   = now.toISOString().split('T')[0];

  try {
    const doc = await adminDb.collection('usage_stats').doc('global').get();
    if (!doc.exists) return null;
    const data = doc.data() || {};
    return {
      monthly: data[`month_${monthKey}`] || {},
      daily:   data[`day_${dayKey}`]     || {},
    };
  } catch {
    return null;
  }
}

async function getStorageUsage(): Promise<{ bytes: number; fileCount: number } | null> {
  try {
    if (getApps().length === 0) return null;
    const bucket = getStorage().bucket();
    const [files] = await bucket.getFiles({ maxResults: 1000 });
    let totalBytes = 0;
    for (const file of files) {
      const meta = file.metadata;
      totalBytes += parseInt(String(meta.size || '0'), 10);
    }
    return { bytes: totalBytes, fileCount: files.length };
  } catch {
    return null;
  }
}

async function getGroqUsage(): Promise<{ tokensUsed: number; limit: number } | null> {
  const key = process.env.GROQ_API_KEY;
  if (!key) return null;
  try {
    const res = await fetch('https://api.groq.com/openai/v1/usage', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    // Groq usage API may return daily stats
    const used = data.data?.[0]?.total_tokens || data.total_tokens || 0;
    return { tokensUsed: used, limit: LIMITS.groq.tokens };
  } catch {
    return null;
  }
}

export async function GET() {
  const [aiStats, storageInfo, groqUsage] = await Promise.all([
    getAiUsageStats(),
    getStorageUsage(),
    getGroqUsage(),
  ]);

  const now    = new Date();
  const daysInMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const dayOfMonth  = now.getDate();

  const monthly = aiStats?.monthly || {};
  const daily   = aiStats?.daily   || {};

  const fmt = (n: number) => n?.toLocaleString?.() ?? String(n);

  const services = [
    {
      id: 'gemini',
      name: 'Gemini 2.5 Flash',
      provider: 'Google',
      emoji: '⚡',
      used: daily.gemini_requests || 0,
      limit: LIMITS.gemini.requests,
      unit: '요청',
      period: '일',
      available: !!process.env.GEMINI_API_KEY,
      note: `이번달 총 ${fmt(monthly.gemini_requests || 0)}건`,
    },
    {
      id: 'claude',
      name: 'Claude Sonnet',
      provider: 'Anthropic',
      emoji: '🧠',
      used: monthly.claude_tokens || 0,
      limit: LIMITS.claude.tokens,
      unit: '토큰',
      period: '월',
      available: !!process.env.ANTHROPIC_API_KEY,
      note: `${fmt(monthly.claude_requests || 0)}건 호출`,
    },
    {
      id: 'gpt',
      name: 'GPT-4o',
      provider: 'OpenAI',
      emoji: '👔',
      used: monthly.gpt_tokens || 0,
      limit: LIMITS.gpt.tokens,
      unit: '토큰',
      period: '월',
      available: !!process.env.OPENAI_API_KEY,
      note: `${fmt(monthly.gpt_requests || 0)}건 호출`,
    },
    {
      id: 'groq',
      name: 'Groq',
      provider: 'Groq',
      emoji: '🚀',
      used: groqUsage?.tokensUsed ?? (daily.groq_tokens || 0),
      limit: LIMITS.groq.tokens,
      unit: '토큰',
      period: '일',
      available: !!process.env.GROQ_API_KEY,
      note: groqUsage ? '실시간' : `${fmt(monthly.groq_requests || 0)}건 호출`,
      realtime: !!groqUsage,
    },
    {
      id: 'firestore',
      name: 'Firestore',
      provider: 'Firebase',
      emoji: '🔥',
      used: daily.fs_reads || 0,
      limit: LIMITS.firestore_reads.count,
      unit: '읽기',
      period: '일',
      available: true,
      note: `쓰기 ${fmt(daily.fs_writes || 0)}건`,
    },
    {
      id: 'storage',
      name: 'Storage',
      provider: 'Firebase',
      emoji: '🗄️',
      used: storageInfo ? Math.round(storageInfo.bytes / 1024 / 1024) : null,
      limit: 1024,
      unit: 'MB',
      period: '누적',
      available: true,
      note: storageInfo ? `${storageInfo.fileCount}개 파일` : '조회 중',
      realtime: !!storageInfo,
    },
    {
      id: 'vercel',
      name: 'Vercel',
      provider: 'Vercel',
      emoji: '▲',
      used: monthly.vercel_deploys || null,
      limit: 100,
      unit: '배포',
      period: '월',
      available: !!process.env.VERCEL_TOKEN,
      note: process.env.VERCEL_TOKEN ? '실시간' : 'VERCEL_TOKEN 미설정',
    },
  ];

  return NextResponse.json({ services, updatedAt: new Date().toISOString() });
}
