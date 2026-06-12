import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listBirthdayCampaigns } from '@/lib/birthdayCampaign.server';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const year = searchParams.get('year');
  const limit = searchParams.get('limit');

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  try {
    const result = await listBirthdayCampaigns(storeId, {
      year: year ? Number(year) : undefined,
      limit: limit ? Number(limit) : undefined,
    });
    return NextResponse.json(result);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
