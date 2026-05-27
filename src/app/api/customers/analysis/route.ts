import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';

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

    // ── 요일별 방문 패턴 ─────────────────────────────────────────
    const DOW_LABELS = ['일', '월', '화', '수', '목', '금', '토'];
    const dowVisits  = Array(7).fill(0);
    const dowSales   = Array(7).fill(0);

    for (const d of salesSnap.docs) {
      const r = d.data();
      const dateStr = r.date as string;
      if (!dateStr || dateStr.length < 10) continue;
      const dow = new Date(dateStr + 'T00:00:00').getDay();
      dowVisits[dow] += Number(r.visitCount || 1);
      dowSales[dow]  += Number(r.totalSale  || 0);
    }
    const dowPattern = DOW_LABELS.map((label, i) => ({
      dow: label,
      visits: dowVisits[i],
      sales: dowSales[i],
    }));

    // ── 재방문율 & 방문 빈도 분포 ────────────────────────────────
    const visitMap: Record<string, number> = {};
    for (const d of salesSnap.docs) {
      const code = d.data().cusCode as string;
      if (!code) continue;
      visitMap[code] = (visitMap[code] || 0) + Number(d.data().visitCount || 1);
    }

    const totalCustomers   = Object.keys(visitMap).length;
    const returnCustomers  = Object.values(visitMap).filter(v => v >= 2).length;
    const returnRate       = totalCustomers > 0
      ? Math.round((returnCustomers / totalCustomers) * 100)
      : 0;

    // 방문 빈도 분포 (1회, 2~3회, 4~9회, 10회+)
    const freqBuckets = [0, 0, 0, 0];
    for (const v of Object.values(visitMap)) {
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

    // ── 등급별 분포 ──────────────────────────────────────────────
    const gradeMap: Record<string, { count: number; totalSales: number }> = {};
    for (const d of customersSnap.docs) {
      const grade = (d.data().grade as string) || '미지정';
      if (!gradeMap[grade]) gradeMap[grade] = { count: 0, totalSales: 0 };
      gradeMap[grade].count++;
    }
    // 매출 합산
    for (const d of salesSnap.docs) {
      const code = d.data().cusCode as string;
      const cusDoc = customersSnap.docs.find(c => c.data().cusCode === code);
      if (!cusDoc) continue;
      const grade = (cusDoc.data().grade as string) || '미지정';
      if (gradeMap[grade]) {
        gradeMap[grade].totalSales += Number(d.data().totalSale || 0);
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
      const wd = String(d.data().writeDate || '').slice(0, 7);
      if (wd in monthlyNew) monthlyNew[wd]++;
    }
    const newCustomerTrend = Object.entries(monthlyNew).map(([month, count]) => ({ month, count }));

    return NextResponse.json({
      dowPattern,
      returnRate,
      freqDistribution,
      gradeDistribution,
      newCustomerTrend,
      totalCustomers: customersSnap.size,
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
