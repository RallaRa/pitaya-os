import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { FieldValue } from 'firebase-admin/firestore';

// POST /api/admin/recalc-netsales
// 권한: master, superuser
// source='pos_bridge' 전체 조회 → pos_finish_total SUM 기준으로 netSales, returnAmount 일괄 갱신
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userDoc  = await adminDb.collection('users').doc(user.uid).get();
  const userData = userDoc.exists ? userDoc.data() : null;
  const groupId  = userData?.groupId || 'staff';

  if (groupId !== 'master' && !isSuperuserEmail(user.email)) {
    return NextResponse.json({ error: '권한이 없습니다 (master/superuser만 허용)' }, { status: 403 });
  }

  let body: { storeId?: string };
  try { body = await req.json(); }
  catch { body = {}; }

  const storeId = body.storeId || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  // 1. source='pos_bridge' daily_reports 전체 조회
  const reportsSnap = await adminDb
    .collection('daily_reports')
    .where('storeId', '==', storeId)
    .where('source', '==', 'pos_bridge')
    .get();

  let fixed = 0;

  for (const doc of reportsSnap.docs) {
    const d = doc.data();
    const reportDate = d.reportDate ?? '';
    if (!reportDate) continue;

    try {
      // 2. pos_finish_total에서 날짜별 SUM 조회
      const finishSnap = await adminDb
        .collection('pos_finish_total')
        .doc(`${storeId}_${reportDate}`)
        .get();

      if (!finishSnap.exists) continue;
      const finish = finishSnap.data()!;

      const finishNetSale   = (finish.netSale   ?? 0) as number;
      const finishReturnSale = (finish.returnSale ?? 0) as number;

      if (!finishNetSale) continue;

      // 3. netSales, returnAmount 업데이트
      await adminDb.collection('daily_reports').doc(doc.id).update({
        netSales:       finishNetSale,
        returnAmount:   finishReturnSale,
        lastModifiedAt: FieldValue.serverTimestamp(),
      });
      fixed++;
    } catch { /* 단건 실패는 계속 진행 */ }
  }

  return NextResponse.json({
    fixed,
    total: reportsSnap.size,
    message: `순매출 ${fixed}건 재계산 완료`,
  });
}
