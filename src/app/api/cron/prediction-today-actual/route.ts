import { NextResponse } from 'next/server';
import { refreshAllStoresTodayActualSales } from '@/lib/predictionTodayActual';

/** 30분마다 — 당일 POS 실매출만 예측 캐시에 반영 (AI 없음) */
export async function POST(req: Request) {
  const secret = req.headers.get('x-cron-secret');
  if (process.env.CRON_SECRET && secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await refreshAllStoresTodayActualSales();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
