import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { addDaysYMD, getKSTTodayYMD } from '@/lib/dateUtils';
import { fetchPeriodTotals } from '@/lib/dashboardSalesData';
import { buildSalesCompareEmptyReason } from '@/lib/dashboardEmptyReason';
import { adminDb } from '@/lib/firebase/admin';
import {
  computeTargetProgress,
  createDefaultTargetsDoc,
  daysInMonthYm,
  getMonthTarget,
  prorateWeekTarget,
  resolveActivePeriod,
  resolvePreviousPeriod,
  type StoreSalesTargetsDoc,
} from '@/lib/salesTargets';

function formatRangeLabel(name: string, start: string, end: string): string {
  return `${name} (${start.slice(5)}~${end.slice(5)})`;
}

async function loadTargets(storeId: string): Promise<StoreSalesTargetsDoc> {
  const snap = await adminDb.collection('store_sales_targets').doc(storeId).get();
  if (!snap.exists) return createDefaultTargetsDoc(storeId);
  const data = snap.data() as StoreSalesTargetsDoc;
  return {
    storeId,
    periods: data.periods?.length ? data.periods : createDefaultTargetsDoc(storeId).periods,
  };
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const todayStr = getKSTTodayYMD();
  const todayYm = todayStr.slice(0, 7);

  const dayOfWeek = new Date(`${todayStr}T12:00:00+09:00`).getDay();
  const daysFromMon = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const thisWeekStart = addDaysYMD(todayStr, -daysFromMon);

  const lastWeekEnd = addDaysYMD(thisWeekStart, -1);
  const lastWeekStart = addDaysYMD(lastWeekEnd, -6);

  const thisMonthStart = `${todayYm}-01`;

  const firstOfThisMonth = new Date(`${todayYm}-01T12:00:00+09:00`);
  const lastMonthEndDate = new Date(firstOfThisMonth.getTime() - 86400000);
  const lastMonthEnd = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-${String(lastMonthEndDate.getDate()).padStart(2, '0')}`;
  const lastMonthStart = `${lastMonthEndDate.getFullYear()}-${String(lastMonthEndDate.getMonth() + 1).padStart(2, '0')}-01`;

  try {
    const targetsDoc = await loadTargets(storeId);
    const activePeriod = resolveActivePeriod(targetsDoc.periods, todayYm);
    const previousPeriod = resolvePreviousPeriod(targetsDoc.periods, todayYm);
    const monthTarget = getMonthTarget(activePeriod, todayYm);
    const weekTarget = prorateWeekTarget(monthTarget, thisWeekStart, todayStr, todayStr);

    const [thisWeek, lastWeek, thisMonth, lastMonth] = await Promise.all([
      fetchPeriodTotals(storeId, thisWeekStart, todayStr, formatRangeLabel('이번 주', thisWeekStart, todayStr)),
      fetchPeriodTotals(storeId, lastWeekStart, lastWeekEnd, formatRangeLabel('지난 주', lastWeekStart, lastWeekEnd)),
      fetchPeriodTotals(storeId, thisMonthStart, todayStr, formatRangeLabel('이번 달', thisMonthStart, todayStr)),
      fetchPeriodTotals(storeId, lastMonthStart, lastMonthEnd, formatRangeLabel('지난 달', lastMonthStart, lastMonthEnd)),
    ]);

    const pct = (cur: number, prev: number) =>
      prev > 0 ? Math.round(((cur - prev) / prev) * 100) : null;

    const emptyReason = buildSalesCompareEmptyReason({
      weekCurrentNet: thisWeek.net,
      weekPrevNet: lastWeek.net,
      monthCurrentNet: thisMonth.net,
    });

    const monthProgress = computeTargetProgress({
      actualNet: thisMonth.net,
      actualCustomers: thisMonth.customers,
      startYmd: thisMonthStart,
      endYmd: todayStr,
      target: monthTarget,
      todayYmd: todayStr,
      periodDays: daysInMonthYm(todayYm),
    });

    const weekProgress = computeTargetProgress({
      actualNet: thisWeek.net,
      actualCustomers: thisWeek.customers,
      startYmd: thisWeekStart,
      endYmd: todayStr,
      target: weekTarget,
      todayYmd: todayStr,
      periodDays: 7,
    });

    return NextResponse.json({
      week: {
        current: thisWeek,
        previous: lastWeek,
        pct: pct(thisWeek.net, lastWeek.net),
        target: {
          sales: weekTarget.sales,
          customers: weekTarget.customers,
          progress: weekProgress,
        },
      },
      month: {
        current: thisMonth,
        previous: lastMonth,
        pct: pct(thisMonth.net, lastMonth.net),
        target: {
          sales: monthTarget.sales,
          customers: monthTarget.customers,
          progress: monthProgress,
        },
      },
      targetsMeta: {
        todayYm,
        activePeriod: activePeriod
          ? { id: activePeriod.id, startYm: activePeriod.startYm, endYm: activePeriod.endYm }
          : null,
        previousPeriod: previousPeriod
          ? { id: previousPeriod.id, startYm: previousPeriod.startYm, endYm: previousPeriod.endYm }
          : null,
        hasMonthTarget: monthTarget.sales > 0 || monthTarget.customers > 0,
      },
      emptyReason,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sales-compare]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
