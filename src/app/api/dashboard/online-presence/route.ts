import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { fetchStoreOnlinePresence } from '@/lib/onlinePresence.server';
import { getKSTTodayYMD } from '@/lib/dateUtils';

export const maxDuration = 60;

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const refresh = searchParams.get('refresh') === '1';

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const today = getKSTTodayYMD();
  const cacheId = `online_presence_${storeId}_${today}`;
  const cacheRef = adminDb.collection('dashboard_cache').doc(cacheId);

  if (!refresh) {
    try {
      const cached = await cacheRef.get();
      if (cached.exists) {
        const d = cached.data()!;
        const ts = d.fetchedAt?.toDate?.()?.getTime?.() ?? new Date(d.fetchedAt || 0).getTime();
        if (ts && Date.now() - ts < CACHE_TTL_MS) {
          return NextResponse.json({ ...d.payload, cached: true });
        }
      }
    } catch {
      /* ignore cache read errors */
    }
  }

  let storeName = '강서 정육점';
  let regionSigungu = '';
  let regionSido = '';

  try {
    const storeDoc = await adminDb.collection('stores').doc(storeId).get();
    if (storeDoc.exists) {
      const s = storeDoc.data()!;
      storeName = String(s.storeName || storeName);
      regionSigungu = String(s.regionSigungu || '');
      regionSido = String(s.regionSido || '');
    }
  } catch {
    /* use defaults */
  }

  const result = await fetchStoreOnlinePresence({ storeName, regionSigungu, regionSido });

  try {
    await cacheRef.set({
      payload: result,
      fetchedAt: new Date(),
      storeId,
      date: today,
    });
  } catch {
    /* cache write optional */
  }

  return NextResponse.json({ ...result, cached: false });
}
