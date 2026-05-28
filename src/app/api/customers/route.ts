import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { maskName, maskPhone } from '@/lib/encryption';

// GET /api/customers?storeId=X&grade=X&page=1&limit=50
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const grade   = searchParams.get('grade')   || '';
  const page    = Math.max(1, Number(searchParams.get('page')  || '1'));
  const limit   = Math.min(100, Number(searchParams.get('limit') || '50'));

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    // 고객 목록 조회
    let q: FirebaseFirestore.Query = adminDb.collection('pos_customers')
      .where('storeId', '==', storeId)
      .orderBy('point', 'desc')
      .limit(500);
    const snap = await q.get();

    const customers = snap.docs.map(d => {
      const r = d.data();
      return {
        cusCode:    r.cusCode,
        nameMasked: r.nameEncrypted ? '● 암호화됨' : maskName(r.name || ''),
        grade:      r.grade    || '',
        point:      r.point    || 0,
        writeDate:  r.writeDate || '',
      };
    });

    // 등급 필터
    const filtered = grade ? customers.filter(c => c.grade === grade) : customers;
    const total    = filtered.length;
    const paginated = filtered.slice((page - 1) * limit, page * limit);

    // 고객별 판매 집계
    const salesSnap = await adminDb.collection('pos_customer_sales')
      .where('storeId', '==', storeId)
      .get();

    const salesMap: Record<string, { totalSales: number; visits: number; lastVisit: string }> = {};
    for (const d of salesSnap.docs) {
      const r = d.data();
      const code = r.cusCode as string;
      if (!salesMap[code]) salesMap[code] = { totalSales: 0, visits: 0, lastVisit: '' };
      salesMap[code].totalSales += Number(r.totalSale || 0);
      salesMap[code].visits     += Number(r.visitCount || 1);
      if (!salesMap[code].lastVisit || r.date > salesMap[code].lastVisit) {
        salesMap[code].lastVisit = r.date as string;
      }
    }

    const enriched = paginated.map(c => ({
      ...c,
      totalVisits: salesMap[c.cusCode]?.visits    ?? 0,
      totalSales:  salesMap[c.cusCode]?.totalSales ?? 0,
      lastVisit:   salesMap[c.cusCode]?.lastVisit  ?? '',
    }));

    // 이번달 통계
    const nowYM = new Date().toISOString().slice(0, 7);
    const monthCodes = new Set(
      salesSnap.docs
        .filter(d => String(d.data().date || '').startsWith(nowYM))
        .map(d => d.data().cusCode as string)
    );
    const newCodes = new Set(
      snap.docs
        .filter(d => String(d.data().writeDate || '').startsWith(nowYM))
        .map(d => d.data().cusCode as string)
    );
    const totalSalesSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().totalSale || 0), 0);
    const totalVisitsSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().visitCount || 1), 0);

    return NextResponse.json({
      customers: enriched,
      total,
      page,
      stats: {
        totalCustomers:   total,
        monthlyVisitors:  monthCodes.size,
        newCustomers:     newCodes.size,
        avgSpend: totalVisitsSum > 0 ? Math.round(totalSalesSum / totalVisitsSum) : 0,
      },
      grades: [...new Set(customers.map(c => c.grade).filter(Boolean))].sort(),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
