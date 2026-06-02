import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { predictionCacheDocId } from '@/lib/predictionDailyLock';
import {
  enrichPredictionItemsWithTodayActual,
  isTodayActualCacheFresh,
  refreshStoreTodayActualSales,
} from '@/lib/predictionTodayActual';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const today = getKSTTodayYMD();
  const force = searchParams.get('force') === '1';

  try {
    const cacheRef = adminDb.collection('predictions').doc(predictionCacheDocId(storeId, today));
    const snap = await cacheRef.get();
    if (!snap.exists) {
      return NextResponse.json({ error: '예측 캐시 없음 — 먼저 AI 예측을 생성하세요' }, { status: 404 });
    }

    const d = snap.data()!;
    if (!force && isTodayActualCacheFresh(d.todayActualUpdatedAt)) {
      return NextResponse.json({
        ok: true,
        cached: true,
        topItems: d.topItems || [],
        baseTopItems: d.baseTopItems || [],
        bottomItems: d.bottomItems || [],
        hasTodaySalesData: d.hasTodaySalesData ?? false,
        todaySalesAsOf: d.todaySalesAsOf || today,
        todayActualUpdatedAt: d.todayActualUpdatedAt,
      });
    }

    const result = await refreshStoreTodayActualSales(storeId, today);
    if (!result.ok) {
      return NextResponse.json({ error: result.reason || '갱신 실패' }, { status: 404 });
    }

    const updated = await cacheRef.get();
    const u = updated.data()!;
    return NextResponse.json({
      ok: true,
      cached: false,
      topItems: u.topItems || [],
      baseTopItems: u.baseTopItems || [],
      bottomItems: u.bottomItems || [],
      hasTodaySalesData: u.hasTodaySalesData ?? false,
      todaySalesAsOf: u.todaySalesAsOf || today,
      todayActualUpdatedAt: u.todayActualUpdatedAt,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
