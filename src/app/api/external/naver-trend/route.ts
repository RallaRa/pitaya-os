import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { fetchNaverTrendData } from '@/lib/naverTrendServer';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';

  const result = await fetchNaverTrendData(storeId);

  if (result.noKeywords) {
    return NextResponse.json(
      { error: result.error, trends: [], noKeywords: true },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  }

  if (result.error && result.trends.length === 0) {
    return NextResponse.json(
      { error: result.error, trends: [] },
      { status: result.error.includes('Naver API') ? 500 : 200, headers: { 'Cache-Control': 'no-store' } },
    );
  }

  return NextResponse.json(
    { trends: result.trends, fetchedAt: new Date().toISOString() },
    { headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' } },
  );
}
