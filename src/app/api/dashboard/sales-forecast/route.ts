import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { fetchDailyItemTrend } from '@/lib/dashboardSalesData';
import { buildWeeklyEmptyReason } from '@/lib/dashboardEmptyReason';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const days    = Math.min(Number(searchParams.get('days') || '30'), 90);
  const item    = searchParams.get('item') || '';

  if (!storeId) {
    return NextResponse.json({
      chartData: [],
      items: [],
      stats: {},
      modelAccuracy: 0,
      days,
      dataPoints: 0,
      emptyReason: buildWeeklyEmptyReason({ storeId: '', itemCount: 0 }),
    });
  }

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = toYMD(since);

  try {
    const { dateMap, itemTotals } = await fetchDailyItemTrend(storeId, sinceStr);

    const topItems = Object.entries(itemTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    if (topItems.length === 0) {
      return NextResponse.json({
        chartData: [],
        items: [],
        stats: {},
        modelAccuracy: 0,
        days,
        dataPoints: 0,
        emptyReason: buildWeeklyEmptyReason({ storeId, itemCount: 0 }),
      });
    }

    const dates = Object.keys(dateMap).sort();

    const filterItems = item ? [item] : topItems.slice(0, 5);
    const chartData = dates.map(date => {
      const row: Record<string, string | number> = { date };
      filterItems.forEach(name => {
        row[name] = dateMap[date]?.[name] || 0;
      });
      return row;
    });

    const stats: Record<string, { total: number; avg: number; max: number; min: number; days: number }> = {};
    topItems.slice(0, 20).forEach(name => {
      const vals = dates.map(d => dateMap[d]?.[name] || 0).filter(v => v > 0);
      if (vals.length === 0) return;
      stats[name] = {
        total: vals.reduce((a, b) => a + b, 0),
        avg:   Math.round(vals.reduce((a, b) => a + b, 0) / vals.length * 10) / 10,
        max:   Math.max(...vals),
        min:   Math.min(...vals),
        days:  vals.length,
      };
    });

    let modelAccuracy = 0;
    try {
      const today = toYMD(new Date());
      const predDoc = await adminDb.collection('predictions')
        .doc(today + '_' + storeId).get();
      modelAccuracy = predDoc.data()?.modelAccuracy || 0;
    } catch {}

    return NextResponse.json({
      chartData,
      items: topItems,
      stats,
      modelAccuracy,
      days,
      dataPoints: dates.length,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error('[sales-forecast]', msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
