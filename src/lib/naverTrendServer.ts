import { adminDb } from '@/lib/firebase/admin';

const CLIENT_ID     = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const API_URL       = 'https://openapi.naver.com/v1/datalab/search';

export interface NaverTrendItem {
  groupName: string;
  data: { period: string; ratio: number }[];
  current: number;
  change: number;
}

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function loadActiveKeywordGroups(storeId: string) {
  const docId = storeId || 'global';
  const snap = await adminDb.collection('naver_trend_keywords').doc(docId).get();
  if (!snap.exists) return [];
  return (snap.data()?.keywordGroups || [])
    .filter((g: { active?: boolean }) => g.active)
    .slice(0, 5);
}

export async function fetchNaverTrendData(storeId: string): Promise<{
  trends: NaverTrendItem[];
  error?: string;
  noKeywords?: boolean;
}> {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    return { trends: [], error: '네이버 API 미연동' };
  }

  const keywordGroups = await loadActiveKeywordGroups(storeId);
  if (keywordGroups.length === 0) {
    return { trends: [], error: '키워드 미설정', noKeywords: true };
  }

  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const body = {
    startDate: formatDate(startDate),
    endDate: formatDate(endDate),
    timeUnit: 'date',
    keywordGroups: keywordGroups.map((g: { groupName: string; keywords?: string[] }) => ({
      groupName: g.groupName,
      keywords: g.keywords?.length ? g.keywords : [g.groupName],
    })),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Naver-Client-Id': CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Naver API ${res.status}: ${text.slice(0, 200)}`);
    }

    const data = await res.json();
    const trends = (data.results || []).map((r: { title: string; data?: { ratio: number }[] }) => {
      const ratios = (r.data || []).map(d => d.ratio as number);
      const yesterday = ratios[ratios.length - 2] ?? 0;
      const today = ratios[ratios.length - 1] ?? 0;
      const change = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : 0;
      return {
        groupName: r.title,
        data: r.data || [],
        current: Math.round(today),
        change,
      };
    });

    return { trends };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return { trends: [], error: msg };
  }
}
