import { NextResponse } from 'next/server';
import { runSalesHourlyAlertsAllStores } from '@/lib/salesHourlyAlertRunner';

function isAuthorized(req: Request) {
  const authHeader = req.headers.get('authorization') || '';
  const cronSecret = process.env.CRON_SECRET || '';
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;
  const xSecret = req.headers.get('x-cron-secret');
  if (cronSecret && xSecret === cronSecret) return true;
  return !cronSecret;
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runSalesHourlyAlertsAllStores();
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'sales hourly alert failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  return GET(req);
}
