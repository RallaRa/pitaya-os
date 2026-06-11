import { NextResponse } from 'next/server';
import { runWeatherOrderSuggestionAllStores } from '@/lib/pos/weatherOrderSuggestion.server';

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

/** 매일 07:00 KST — 내일 날씨 기반 발주 제안 */
export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const results = await runWeatherOrderSuggestionAllStores();
    return NextResponse.json({ ok: true, results });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'weather-order-suggestion failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
