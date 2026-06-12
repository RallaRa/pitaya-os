import { NextResponse } from 'next/server';
import { verifyToken, canManageStore } from '@/lib/authVerify';
import {
  generateWeeklyCoaching,
  getLatestWeeklyCoaching,
} from '@/lib/weeklyCoaching.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const briefing = await getLatestWeeklyCoaching(storeId);
    return NextResponse.json({ briefing });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { storeId?: string; skipMessenger?: boolean };
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const { storeId, skipMessenger } = body;
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  if (!await canManageStore(authUser.uid, storeId, authUser.email)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const briefing = await generateWeeklyCoaching(storeId, { skipMessenger });
    return NextResponse.json({ success: true, briefing });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
