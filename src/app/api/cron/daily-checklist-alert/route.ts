import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { getKSTTodayYMD } from '@/lib/dateUtils';
import { kstDateParts } from '@/lib/hygieneSchedule';
import {
  inferChecklistAlertKind,
  parseChecklistAlertKind,
  runDailyChecklistAlerts,
} from '@/lib/dailyChecklist.server';

/** KST 09:30 개점 / 21:00 폐점 — 미완료 체크리스트 메신저 알림 */
export async function GET(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  const { hour, minute, dateStr } = kstDateParts();
  const forced = parseChecklistAlertKind(new URL(req.url).searchParams.get('kind'));
  const kind = forced ?? inferChecklistAlertKind(hour, minute);
  const checkDate = new URL(req.url).searchParams.get('date') || dateStr || getKSTTodayYMD();

  if (!kind) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: `kst ${hour}:${minute} — not alert window (use ?kind=open|close)`,
    });
  }

  try {
    const result = await runDailyChecklistAlerts(kind, checkDate);
    return NextResponse.json({
      ok: true,
      kind,
      checkDate,
      kstHour: hour,
      kstMinute: minute,
      ...result,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
