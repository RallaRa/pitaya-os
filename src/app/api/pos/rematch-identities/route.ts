import { NextResponse } from 'next/server';
import { rematchAllUnresolvedIdentities } from '@/lib/publicOrderIdentity';

function checkAuth(req: Request): boolean {
  const apiKey =
    req.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
    req.headers.get('x-api-key') ||
    '';
  return !!process.env.POS_BRIDGE_KEY && apiKey === process.env.POS_BRIDGE_KEY;
}

// POST /api/pos/rematch-identities
export async function POST(req: Request) {
  if (!checkAuth(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: { storeId?: string; includeResolved?: boolean } = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const storeId = body.storeId || process.env.POS_STORE_ID || '';
  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  const result = await rematchAllUnresolvedIdentities(storeId, {
    includeResolved: body.includeResolved === true,
  });

  return NextResponse.json({ success: true, storeId, ...result });
}
