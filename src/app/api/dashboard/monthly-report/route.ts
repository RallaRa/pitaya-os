import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { buildMonthlyReport } from '@/lib/monthlyReport';

export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const params = new URL(req.url).searchParams;
  const storeId = params.get('storeId') || '';
  const month = params.get('month') || '';
  if (!storeId || !month) return NextResponse.json({ error: 'storeId and month required' }, { status: 400 });

  const [y, m] = month.split('-').map(Number);
  const report = await buildMonthlyReport(storeId, y, m);
  return NextResponse.json({ report });
}
