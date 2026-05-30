import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { pickBestReportByDate } from '@/lib/reportDedup';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';

function formatRangeLabel(name: string, start: string, end: string): string {
  return `${name} (${start.slice(5)}~${end.slice(5)})`;
}

interface PeriodStat { label: string; net: number; total: number; customers: number; start?: string; end?: string; }

async function fetchPeriod(storeId: string, start: string, end: string, label: string): Promise<PeriodStat> {
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
  return { label, net, total, customers, start, end };
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const todayStr = getKSTTodayYMD();
  const today = new Date(`${todayStr}T12:00:00+09:00`);

  // 이번 주 (월~오늘, KST)
  const dayOfWeek = today.getDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = addDaysYMD(todayStr, -daysFromMon);

  // 지난 주
  const lastWeekEnd   = addDaysYMD(thisWeekStart, -1);
  const lastWeekStart = addDaysYMD(lastWeekEnd, -6);

  // 이번 달
  const thisMonthStart = `${todayStr.slice(0, 7)}-01`;

  // 지난 달
  const firstOfThisMonth = new Date(`${todayStr.slice(0, 7)}-01T12:00:00+09:00`);
  const lastMonthEndDate = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthEnd = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEndDate.getDate()).padStart(2, '0')}`;
  const lastMonthStart = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-01`;

  try {
    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      fetchPeriod(storeId, thisWeekStart, todayStr, formatRangeLabel('이번 주', thisWeekStart, todayStr)),
      fetchPeriod(storeId, lastWeekStart, lastWeekEnd, formatRangeLabel('지난 주', lastWeekStart, lastWeekEnd)),
      fetchPeriod(storeId, thisMonthStart, todayStr, formatRangeLabel('이번 달', thisMonthStart, todayStr)),
      fetchPeriod(storeId, lastMonthStart, lastMonthEnd, formatRangeLabel('지난 달', lastMonthStart, lastMonthEnd)),
    ]);

    const pct = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    return NextResponse.json({
      week: {
        current:  thisWeek,
        previous: lastWeek,
        pct: pct(thisWeek.net, lastWeek.net),
        range: { current: { start: thisWeekStart, end: todayStr }, previous: { start: lastWeekStart, end: lastWeekEnd } },
      },
      month: {
        current:  thisMonth,
        previous: lastMonth,
        pct: pct(thisMonth.net, lastMonth.net),
        range: { current: { start: thisMonthStart, end: todayStr }, previous: { start: lastMonthStart, end: lastMonthEnd } },
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
