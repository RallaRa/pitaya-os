import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { computeBreakEvenStatus } from '@/lib/breakEven.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const date = searchParams.get('date') || undefined;

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const status = await computeBreakEvenStatus(storeId, date);
    return NextResponse.json(status);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
