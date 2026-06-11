import { NextResponse } from 'next/server';
import { runDiscountAbuseDailyReportAllStores } from '@/lib/pos/discountAbuse.server';

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

/** 매일 아침(KST) — 전일 할인 중복 리포트 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runDiscountAbuseDailyReportAllStores();
    return NextResponse.json({ ok: true, ...result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'discount-abuse-report failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
