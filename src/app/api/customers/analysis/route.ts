import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { normDateYMD } from '@/lib/dateUtils';
import {
  buildVisitDatesMap,
  computeVisitCycle,
  cycleDistributionBuckets,
  mergeVisitCycle,
} from '@/lib/customerVisitCycle';

// GET /api/customers/analysis?storeId=X
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    const [salesSnap, customersSnap] = await Promise.all([
      adminDb.collection('pos_customer_sales').where('storeId', '==', storeId).get(),
      adminDb.collection('pos_customers').where('storeId', '==', storeId).get(),
    ]);

    const salesDocs = salesSnap.docs.map(d => d.data());
    const visitDatesMap = buildVisitDatesMap(salesDocs);

    // ── 요일별 방문 패턴 ─────────────────────────────────────────
    const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
    const dowVisits  = Array(7).fill(0);
    const dowSales   = Array(7).fill(0);

    for (const r of salesDocs) {
      const dateStr = normDateYMD(String(r.date || ''));
      if (!dateStr) continue;
      const dow = new Date(dateStr + 'T12:00:00+09:00').getDay();
      dowVisits[dow] += 1;
      dowSales[dow]  += Number(r.totalSale || 0);
    }
    const dowPattern = DOW_LABELS.map((label, i) => ({
      dow: label,
      visits: dowVisits[i],
      sales: dowSales[i],
    }));

    // ── 재방문율 & 방문 빈도 분포 (고유 방문일 기준) ─────────────
    const visitDayMap: Record<string, number> = {};
    for (const [code, dates] of visitDatesMap) {
      visitDayMap[code] = dates.length;
    }

    const totalWithSales = Object.keys(visitDayMap).length;
    const returnCustomers = Object.values(visitDayMap).filter(v => v >= 2).length;
    const returnRate = totalWithSales > 0
      ? Math.round((returnCustomers / totalWithSales) * 100)
      : 0;

    const freqBuckets = [0, 0, 0, 0];
    for (const v of Object.values(visitDayMap)) {
      if      (v === 1)  freqBuckets[0]++;
      else if (v <= 3)   freqBuckets[1]++;
      else if (v <= 9)   freqBuckets[2]++;
      else               freqBuckets[3]++;
    }
    const freqDistribution = [
      { label: '1회', count: freqBuckets[0] },
      { label: '2~3회', count: freqBuckets[1] },
      { label: '4~9회', count: freqBuckets[2] },
      { label: '10회+', count: freqBuckets[3] },
    ];

    // ── 방문 주기 분포 & 이탈 ────────────────────────────────────
    const cyclesForDist: Array<{ avgCycleDays: number | null }> = [];
    let overdueCount = 0;
    let dueSoonCount = 0;
    let withCycleData = 0;

    for (const d of customersSnap.docs) {
      const r = d.data();
      const code = String(r.cusCode || '');
      const fromSales = computeVisitCycle(visitDatesMap.get(code) || []);
      const cycle = mergeVisitCycle(
        fromSales,
        Number(r.visitCount || 0),
        String(r.joinDate || r.writeDate || ''),
        String(r.lastVisitDate || r.writeDate || ''),
      );
      if (cycle.avgCycleDays != null) {
        withCycleData++;
        cyclesForDist.push({ avgCycleDays: cycle.avgCycleDays });
      }
      if (cycle.cycleStatus === 'overdue') overdueCount++;
      if (cycle.cycleStatus === 'due_soon') dueSoonCount++;
    }

    const cycleDistribution = cycleDistributionBuckets(cyclesForDist);

    // ── 등급별 분포 ──────────────────────────────────────────────
    const gradeMap: Record<string, { count: number; totalSales: number }> = {};
    for (const d of customersSnap.docs) {
      const grade = (d.data().grade as string) || '미지정';
      if (!gradeMap[grade]) gradeMap[grade] = { count: 0, totalSales: 0 };
      gradeMap[grade].count++;
    }
    const salesByCode: Record<string, number> = {};
    for (const r of salesDocs) {
      const code = String(r.cusCode || '');
      if (!code) continue;
      salesByCode[code] = (salesByCode[code] || 0) + Number(r.totalSale || 0);
    }
    for (const d of customersSnap.docs) {
      const code = String(d.data().cusCode || '');
      const grade = (d.data().grade as string) || '미지정';
      if (gradeMap[grade] && salesByCode[code]) {
        gradeMap[grade].totalSales += salesByCode[code];
      }
    }
    const gradeDistribution = Object.entries(gradeMap)
      .map(([grade, v]) => ({ grade, ...v }))
      .sort((a, b) => b.count - a.count);

    // ── 월별 신규고객 추이 (최근 6개월) ──────────────────────────
    const now = new Date();
    const monthlyNew: Record<string, number> = {};
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const ym = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      monthlyNew[ym] = 0;
    }
    for (const d of customersSnap.docs) {
      const wd = normDateYMD(String(d.data().joinDate || d.data().writeDate || '')).slice(0, 7);
      if (wd in monthlyNew) monthlyNew[wd]++;
    }
    const newCustomerTrend = Object.entries(monthlyNew).map(([month, count]) => ({ month, count }));

    return NextResponse.json({
      dowPattern,
      returnRate,
      freqDistribution,
      gradeDistribution,
      newCustomerTrend,
      cycleDistribution,
      overdueCount,
      dueSoonCount,
      withCycleData,
      totalCustomers: customersSnap.size,
      salesHistoryDays: new Set(salesDocs.map(r => normDateYMD(String(r.date || ''))).filter(Boolean)).size,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Internal error';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
