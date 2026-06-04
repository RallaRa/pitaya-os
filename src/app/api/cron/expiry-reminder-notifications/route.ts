import { NextResponse } from 'next/server';
import { isCronAuthorized, cronUnauthorizedResponse } from '@/lib/cronAuth';
import { processDueExpiryReminders } from '@/lib/expiryReminder';

export async function POST(req: Request) {
  if (!isCronAuthorized(req)) return cronUnauthorizedResponse();

  try {
    const { sent, checked } = await processDueExpiryReminders();
    return NextResponse.json({
      ok: true,
      sent,
      checked,
      processedAt: new Date().toISOString(),
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({
    ok: true,
    message: 'expiry-reminder-notifications cron (KST 당일 7·3·1일 전 알림)',
  });
}
