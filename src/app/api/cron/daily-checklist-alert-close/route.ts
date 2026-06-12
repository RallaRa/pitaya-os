import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { runDailyChecklistAlerts } from '@/lib/dailyChecklist.server';

/** KST 21:00 — 폐점 체크리스트 미완료 알림 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();
  const checkDate = new URL(req.url).searchParams.get('date') || getKSTTodayYMD();
  try {
    const result = await runDailyChecklistAlerts('close', checkDate);
    return NextResponse.json({ ok: true, kind: 'close', checkDate, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
