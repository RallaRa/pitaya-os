import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { pickBestReportByDate } from '@/lib/reportDedup';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00');
  d.setDate(d.getDate() + days);
  return toYMD(d);
}

interface PeriodStat { label: string; net: number; total: number; customers: number; }

async function fetchPeriod(storeId: string, start: string, end: string): Promise<{ net: number; total: number; customers: number }> {
  const snap = await adminDb.collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('reportDate', '>=', start)
    .where('reportDate', '<=', end)
    .limit(60)
    .get();

  const byDate = pickBestReportByDate(
    snap.docs.map(d => ({ ...d.data(), reportDate: d.data().reportDate as string, storeId: d.data().storeId as string | undefined })),
    storeId,
  );

  let net = 0, total = 0, customers = 0;
  for (const dr of byDate.values()) {
    const row = dr as { totalSales?: number; netSales?: number; netSale?: number; returnAmount?: number; discountAmount?: number; customerCount?: number };
    const t = row.totalSales ?? 0;
    net       += row.netSales ?? row.netSale ?? (t - (row.returnAmount ?? 0) - (row.discountAmount ?? 0));
    total     += t;
    customers += row.customerCount ?? 0;
  }
  return { net, total, customers };
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const today = new Date();
  const todayStr = toYMD(today);

  // 이번 주 (월~오늘)
  const dayOfWeek = today.getDay(); // 0=일
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = addDays(todayStr, -daysFromMon);

  // 지난 주
  const lastWeekEnd   = addDays(thisWeekStart, -1);
  const lastWeekStart = addDays(lastWeekEnd, -6);

  // 이번 달
  const thisMonthStart = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01`;

  // 지난 달
  const firstOfThisMonth = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonthEnd = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthStart = `${lastMonthEnd.getFullYear()}-${String(lastMonthEnd.getMonth() + 1).padStart(2, '0')}-01`;

  try {
    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      fetchPeriod(storeId, thisWeekStart, todayStr),
      fetchPeriod(storeId, lastWeekStart, lastWeekEnd),
      fetchPeriod(storeId, thisMonthStart, todayStr),
      fetchPeriod(storeId, lastMonthStart, toYMD(lastMonthEnd)),
    ]);

    const pct = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    return NextResponse.json({
      week: {
        current:  { label: '이번 주', ...thisWeek },
        previous: { label: '지난 주', ...lastWeek },
        pct: pct(thisWeek.net, lastWeek.net),
      },
      month: {
        current:  { label: '이번 달', ...thisMonth },
        previous: { label: '지난 달', ...lastMonth },
        pct: pct(thisMonth.net, lastMonth.net),
      },
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
