import { NextResponse } from 'next/server';
import { runExpiredPollClosures } from '@/lib/messenger/polls.server';

export const dynamic = 'force-dynamic';

/** GET /api/cron/messenger-poll-close — 마감 투표 자동 종료·알림 */
export async function GET(req: Request) {
  const authHeader = req.headers.get('authorization');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await runExpiredPollClosures();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
