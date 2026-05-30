import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';

function formatRangeLabel(name: string, start: string, end: string): string {
  return `${name} (${start.slice(5)}~${end.slice(5)})`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const todayStr = getKSTTodayYMD();
  const today = new Date(`${todayStr}T12:00:00+09:00`);

  const dayOfWeek = today.getDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = addDaysYMD(todayStr, -daysFromMon);

  const lastWeekEnd = addDaysYMD(thisWeekStart, -1);
  const lastWeekStart = addDaysYMD(lastWeekEnd, -6);

  const thisMonthStart = `${todayStr.slice(0, 7)}-01`;

  const firstOfThisMonth = new Date(`${todayStr.slice(0, 7)}-01T12:00:00+09:00`);
  const lastMonthEndDate = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthEnd = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEndDate.getDate()).padStart(2, '0')}`;
  const lastMonthStart = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-01`;

  try {
    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      fetchPeriodTotals(storeId, thisWeekStart, todayStr, formatRangeLabel('이번 주', thisWeekStart, todayStr)),
      fetchPeriodTotals(storeId, lastWeekStart, lastWeekEnd, formatRangeLabel('지난 주', lastWeekStart, lastWeekEnd)),
      fetchPeriodTotals(storeId, thisMonthStart, todayStr, formatRangeLabel('이번 달', thisMonthStart, todayStr)),
      fetchPeriodTotals(storeId, lastMonthStart, lastMonthEnd, formatRangeLabel('지난 달', lastMonthStart, lastMonthEnd)),
    ]);

    const pct = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    return NextResponse.json({
      week: {
        current: thisWeek,
        previous: lastWeek,
        pct: pct(thisWeek.net, lastWeek.net),
      },
      month: {
        current: thisMonth,
        previous: lastMonth,
        pct: pct(thisMonth.net, lastMonth.net),
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sales-compare]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
