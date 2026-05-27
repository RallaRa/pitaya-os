import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

const CLIENT_ID     = process.env.NAVER_CLIENT_ID;
const CLIENT_SECRET = process.env.NAVER_CLIENT_SECRET;
const API_URL       = 'https://openapi.naver.com/v1/datalab/search';

function formatDate(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  if (!CLIENT_ID || !CLIENT_SECRET) {
    return NextResponse.json(
      { error: '네이버 API 미연동', trends: [] },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  // Firestore에서 키워드 그룹 로드
  let keywordGroups: any[] = [];
  try {
    const docId = storeId || 'global';
    const snap = await adminDb.collection('naver_trend_keywords').doc(docId).get();
    if (snap.exists) {
      keywordGroups = (snap.data()?.keywordGroups || [])
        .filter((g: any) => g.active)
        .slice(0, 5);
    }
  } catch { /* ignore */ }

  if (keywordGroups.length === 0) {
    return NextResponse.json(
      { error: '키워드 미설정', trends: [], noKeywords: true },
      { headers: { 'Cache-Control': 'no-store' } }
    );
  }

  const endDate   = new Date();
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);

  const body = {
    startDate: formatDate(startDate),
    endDate:   formatDate(endDate),
    timeUnit:  'date',
    keywordGroups: keywordGroups.map((g: any) => ({
      groupName: g.groupName,
      keywords:  g.keywords || [g.groupName],
    })),
  };

  try {
    const res = await fetch(API_URL, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-Naver-Client-Id':     CLIENT_ID,
        'X-Naver-Client-Secret': CLIENT_SECRET,
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Naver API ${res.status}: ${text}`);
    }

    const data = await res.json();
    const results = (data.results || []).map((r: any) => {
      const ratios = (r.data || []).map((d: any) => d.ratio as number);
      const yesterday = ratios[ratios.length - 2] ?? 0;
      const today     = ratios[ratios.length - 1] ?? 0;
      const change    = yesterday > 0 ? Math.round(((today - yesterday) / yesterday) * 100) : 0;
      return {
        groupName: r.title,
        data:      r.data || [],
        current:   Math.round(today),
        change,
      };
    });

    return NextResponse.json(
      { trends: results, fetchedAt: new Date().toISOString() },
      { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } }
    );
  } catch (e: any) {
    return NextResponse.json({ error: e.message, trends: [] }, { status: 500 });
  }
}
