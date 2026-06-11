import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { runCalendarMessengerNotifications } from '@/lib/messenger/calendarMessenger.server';

/** 매일 KST 08:00 — 캘린더 메신저 알림 (UTC 23:00) */
export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  try {
    const body = await req.json().catch(() => ({}));
    const storeId = body?.storeId ? String(body.storeId) : undefined;

    if (storeId) {
      const result = await runCalendarMessengerNotifications(storeId);
      return NextResponse.json({ ok: true, results: [result] });
    }

    const { adminDb } = await import('@/lib/firebase/admin');
    const storesSnap = await adminDb.collection('stores').limit(50).get();
    const results = [];
    for (const doc of storesSnap.docs) {
      results.push(await runCalendarMessengerNotifications(doc.id));
    }
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'messenger-calendar-notify cron — delivery/absence/holiday cards',
  });
}
