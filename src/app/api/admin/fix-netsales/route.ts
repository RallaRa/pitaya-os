import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';

// POST /api/admin/fix-netsales
// 권한: master, superuser
// daily_reports 중 netSales < totalSales * 0.5 인 문서를 pos_finish_total / pos_sales_header 기준으로 재계산
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userDoc  = await adminDb.collection('users').doc(user.uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const groupId  = userData?.groupId || 'staff';

  if (groupId !== 'master' && !isSuperuserEmail(userData?.email)) {
    return NextResponse.json({ error: '권한이 없습니다 (master/superuser만 허용)' }, { status: 403 });
  }

  let body: { storeId?: string; dryRun?: boolean };
  try { body = await req.json(); }
  catch { body = {}; }

  const storeId = body.storeId || '';
  const dryRun  = body.dryRun === true;

  if (!storeId) {
    return NextResponse.json({ error: 'storeId required' }, { status: 400 });
  }

  // 1. 해당 매장 daily_reports 전체 조회
  const reportsSnap = await adminDb
    .collection('daily_reports')
    .where('storeId', '==', storeId)
    .get();

  const candidates: { id: string; reportDate: string; totalSales: number; netSales: number }[] = [];

  for (const doc of reportsSnap.docs) {
    const d = doc.data();
    const totalSales = d.totalSales ?? 0;
    const netSales   = d.netSales   ?? d.netSale ?? 0;

    // netSales가 totalSales의 50% 미만이면 이상 데이터
    if (totalSales > 0 && netSales < totalSales * 0.5) {
      candidates.push({
        id:          doc.id,
        reportDate:  d.reportDate ?? '',
        totalSales,
        netSales,
      });
    }
  }

  if (candidates.length === 0) {
    return NextResponse.json({ fixed: 0, dryRun, message: '수정이 필요한 데이터 없음' });
  }

  let fixed = 0;
  const details: { reportDate: string; oldNetSales: number; newNetSales: number; source: string }[] = [];

  for (const c of candidates) {
    try {
      // 2. pos_finish_total에서 해당 날짜 조회
      const finishSnap = await adminDb
        .collection('pos_finish_total')
        .doc(`${storeId}_${c.reportDate}`)
        .get();

      const finish = finishSnap.exists ? finishSnap.data() : null;
      const finishNetSale = finish?.netSale ?? 0;

      let newNetSales: number;
      let source: string;

      // finish.netSale이 totalSales의 80% 이상이면 신뢰
      if (finishNetSale >= c.totalSales * 0.8) {
        newNetSales = finishNetSale;
        source = 'pos_finish_total.netSale';
      } else {
        // 신뢰할 수 없으면 pos_sales_header의 totalSale 사용
        const headerSnap = await adminDb
          .collection('pos_sales_header')
          .doc(`${storeId}_${c.reportDate}`)
          .get();
        newNetSales = headerSnap.exists
          ? (headerSnap.data()?.totalSale ?? c.totalSales)
          : c.totalSales;
        source = headerSnap.exists ? 'pos_sales_header.totalSale' : 'daily_reports.totalSales';
      }

      details.push({
        reportDate: c.reportDate,
        oldNetSales: c.netSales,
        newNetSales,
        source,
      });

      if (!dryRun) {
        await adminDb.collection('daily_reports').doc(c.id).update({ netSales: newNetSales });
        fixed++;
      }
    } catch { /* 단건 실패는 계속 진행 */ }
  }

  return NextResponse.json({
    fixed: dryRun ? 0 : fixed,
    candidates: candidates.length,
    dryRun,
    details,
    message: dryRun
      ? `[DRY-RUN] 수정 대상 ${candidates.length}건 발견`
      : `순매출 ${fixed}건 재계산 완료`,
  });
}
