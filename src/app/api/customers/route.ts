import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { maskName } from '@/lib/encryption';
import type { QueryDocumentSnapshot } from 'firebase-admin/firestore';

async function fetchAllCustomers(storeId: string) {
  const docs: QueryDocumentSnapshot[] = [];
  let last: QueryDocumentSnapshot | undefined;
  while (true) {
    let q = adminDb.collection('pos_customers').where('storeId', '==', storeId).limit(1000);
    if (last) q = q.startAfter(last);
    const snap = await q.get();
    docs.push(...snap.docs);
    if (snap.docs.length < 1000) break;
    last = snap.docs[snap.docs.length - 1];
  }
  return docs;
}

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
    const snap = await fetchAllCustomers(storeId);

    const customers = snap.map(d => {
      const r = d.data();
      return {
        cusCode:    r.cusCode,
        nameMasked: r.nameEncrypted ? '● 암호화됨' : maskName(r.name || ''),
        grade:      r.grade    || '',
        cusGubun:   r.cusGubun || '',
        point:      Number(r.point) || 0,
        joinDate:   r.joinDate || r.writeDate || '',
        writeDate:  r.writeDate || r.joinDate || '',
        visitCount: Number(r.visitCount || 0),
        totalPurchase: Number(r.totalPurchase || 0),
        lastVisitDate: r.lastVisitDate || '',
      };
    }).sort((a, b) => b.point - a.point);

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
      totalVisits: salesMap[c.cusCode]?.visits    || c.visitCount || 0,
      totalSales:  salesMap[c.cusCode]?.totalSales || c.totalPurchase || 0,
      lastVisit:   salesMap[c.cusCode]?.lastVisit  || c.lastVisitDate || '',
    }));

    // 이번달 통계
    const nowYM = new Date().toISOString().slice(0, 7);
    const monthCodes = new Set(
      salesSnap.docs
        .filter(d => String(d.data().date || '').startsWith(nowYM))
        .map(d => d.data().cusCode as string)
    );
    const newCodes = new Set(
      snap
        .filter(d => {
          const wd = String(d.data().joinDate || d.data().writeDate || '');
          return wd.startsWith(nowYM);
        })
        .map(d => d.data().cusCode as string)
    );
    const totalSalesSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().totalSale || 0), 0);
    const totalVisitsSum = salesSnap.docs.reduce((s, d) => s + Number(d.data().visitCount || 1), 0);

    return NextResponse.json({
      customers: enriched,
      total,
      page,
      stats: {
        totalCustomers:   customers.length,
        monthlyVisitors:  monthCodes.size,
        newCustomers:     newCodes.size,
        avgSpend: totalVisitsSum > 0 ? Math.round(totalSalesSum / totalVisitsSum) : 0,
      },
      grades: [...new Set(customers.map(c => c.grade).filter(Boolean))].sort(),
    });
  } catch (e: any) {
    console.error('[customers GET]', e);
    const msg = e.message || 'Internal error';
    if (msg.includes('FIREBASE_SERVICE_ACCOUNT_KEY') || msg.includes('Unexpected token')) {
      return NextResponse.json({ error: '서버 Firebase 설정 오류 (FIREBASE_SERVICE_ACCOUNT_KEY 확인)' }, { status: 503 });
    }
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
