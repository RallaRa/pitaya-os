import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';

function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const days    = Math.min(Number(searchParams.get('days') || '30'), 90);
  const item    = searchParams.get('item') || '';

  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceStr = toYMD(since);

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('daily_reports')
      .where('reportDate', '>=', sinceStr)
      .orderBy('reportDate', 'asc');
    if (storeId) q = q.where('storeId', '==', storeId);

    const snap = await q.limit(90).get();

    // 날짜별 품목별 집계
    const dateMap: Record<string, Record<string, number>> = {};
    const allItems = new Set<string>();

    snap.docs.forEach(doc => {
      const d    = doc.data();
      const date = d.reportDate as string;
      if (!dateMap[date]) dateMap[date] = {};
      (d.items || []).forEach((itm: any) => {
        const name = itm.name || '';
        if (!name || name.length > 50) return;
        allItems.add(name);
        dateMap[date][name] = (dateMap[date][name] || 0) + Number(itm.qty || 0);
      });
    });

    // 총 판매량 기준 상위 20개 품목
    const itemTotals: Record<string, number> = {};
    Object.values(dateMap).forEach(dayData => {
      Object.entries(dayData).forEach(([name, qty]) => {
        itemTotals[name] = (itemTotals[name] || 0) + qty;
      });
    });
    const topItems = Object.entries(itemTotals)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([name]) => name);

    // 날짜 배열 생성
    const dates = Object.keys(dateMap).sort();

    // 차트 데이터: 날짜별 각 품목 수량
    const filterItems = item ? [item] : topItems.slice(0, 5);
    const chartData = dates.map(date => {
      const row: Record<string, any> = { date };
      filterItems.forEach(name => {
        row[name] = dateMap[date]?.[name] || 0;
      });
      return row;
    });

    // 통계
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

    // 예측 정확도 (최근 저장된 prediction 문서에서)
    let modelAccuracy = 0;
    try {
      const today = toYMD(new Date());
      const predDoc = await adminDb.collection('predictions')
        .doc(today + '_' + (storeId || 'global')).get();
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
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
