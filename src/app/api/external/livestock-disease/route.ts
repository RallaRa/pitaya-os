import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { fetchRecentLivestockDisease } from '@/lib/mafra/fetchLivestockDisease';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Math.min(Number(searchParams.get('limit') || '20'), 50);
  const daysBack = Math.min(Number(searchParams.get('daysBack') || '365'), 730);
  let regionKeyword = searchParams.get('region') || '';

  const storeId = searchParams.get('storeId') || '';
  if (!regionKeyword && storeId) {
    try {
      const snap = await adminDb.collection('stores').doc(storeId).get();
      if (snap.exists) {
        const d = snap.data()!;
        regionKeyword = String(d.regionSigungu || d.regionSido || '').trim();
      }
    } catch { /* ignore */ }
  }

  try {
    const data = await fetchRecentLivestockDisease({ limit, daysBack, regionKeyword });
    return NextResponse.json(data, {
      headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=600' },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg, rows: [] }, { status: 500 });
  }
}
