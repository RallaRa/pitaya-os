import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import {
  createMessengerCalendarEvent,
  getEmployeeWeekSchedule,
  listMessengerCalendarEvents,
  runCalendarMessengerNotifications,
} from '@/lib/messenger/calendarMessenger.server';
import { ensureScheduleChannel } from '@/lib/messenger/channels.server';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';

export const dynamic = 'force-dynamic';

/** GET /api/messenger/calendar?storeId=&from=&to=&week=1 */
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const from = searchParams.get('from') || getKSTTodayYMD();
    const to = searchParams.get('to') || addDaysYMD(from, 13);
    const scheduleChannelId = await ensureScheduleChannel(storeId).catch(() => null);

    if (searchParams.get('week') === '1') {
      const week = await getEmployeeWeekSchedule(storeId, from);
      return NextResponse.json({ ok: true, scheduleChannelId, ...week });
    }

    const events = await listMessengerCalendarEvents(storeId, from, to);
    return NextResponse.json({ ok: true, scheduleChannelId, events, from, to });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** POST /api/messenger/calendar — 일정 등록 */
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const storeId = String(body.storeId || '');
    const title = String(body.title || '').trim();
    const startDate = String(body.startDate || '');
    if (!storeId || !title || !startDate) {
      return NextResponse.json({ error: 'storeId, title, startDate required' }, { status: 400 });
    }

    const result = await createMessengerCalendarEvent(storeId, {
      title,
      startDate,
      endDate: body.endDate ? String(body.endDate) : undefined,
      startTime: body.startTime ? String(body.startTime) : undefined,
      description: body.description ? String(body.description) : undefined,
      createdBy: user.uid,
    });
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

/** PUT /api/messenger/calendar — 알림 수동 실행 */
export async function PUT(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = String(body.storeId || '');
    if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

    const result = await runCalendarMessengerNotifications(storeId);
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
