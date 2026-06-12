import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import {
  generateWeeklyCoaching,
  runWeeklyCoachingAllStores,
} from '@/lib/weeklyCoaching.server';

/** 매주 월요일 08:00 KST — AI 주간 경영 코치 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const today = getKSTTodayYMD();
  const dow = new Date(`${today}T12:00:00+09:00`).getDay();
  const url = new URL(req.url);
  const force = url.searchParams.get('force') === '1';
  const storeId = url.searchParams.get('storeId');

  if (!force && dow !== 1) {
    return NextResponse.json({ ok: true, skipped: true, reason: `KST weekday=${dow}, not Monday` });
  }

  try {
    if (storeId) {
      const briefing = await generateWeeklyCoaching(storeId, {});
      return NextResponse.json({ ok: true, storeId, weekId: briefing.weekId });
    }
    const results = await runWeeklyCoachingAllStores();
    return NextResponse.json({ ok: true, results, processedAt: new Date().toISOString() });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
