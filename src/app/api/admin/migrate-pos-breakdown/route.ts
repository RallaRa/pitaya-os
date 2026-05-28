import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { FieldValue } from 'firebase-admin/firestore';

// POST /api/admin/migrate-pos-breakdown
// pos_finish_total → daily_reports posBreakdown 보강
// 단계 1: pos_finish_total에 posBreakdown이 있으면 daily_reports에 복사
// 단계 2: pos_finish_total에 없는 경우는 bridge.js migrate 재실행 필요
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

  // pos_finish_total 전체 조회 (해당 store)
  const finishSnap = await adminDb
    .collection('pos_finish_total')
    .where('storeId', '==', storeId)
    .get();

  let updated = 0;
  let skipped = 0; // posBreakdown 없는 경우 (bridge.js 재마이그레이션 필요)
  let noReport = 0; // daily_report 문서 없는 경우

  for (const finishDoc of finishSnap.docs) {
    const finish = finishDoc.data();
    const reportDate = finish.date ?? '';
    if (!reportDate) continue;

    const breakdown = finish.posBreakdown;
    if (!Array.isArray(breakdown) || breakdown.length === 0) {
      skipped++;
      continue;
    }

    const reportDocId = `pos_${storeId}_${reportDate}`;
    const reportRef = adminDb.collection('daily_reports').doc(reportDocId);
    const reportSnap = await reportRef.get();

    if (!reportSnap.exists) {
      noReport++;
      continue;
    }

    try {
      await reportRef.update({
        posBreakdown:   breakdown,
        lastModifiedAt: FieldValue.serverTimestamp(),
      });
      updated++;
    } catch { /* 단건 실패는 계속 */ }
  }

  return NextResponse.json({
    updated,
    skipped,
    noReport,
    total: finishSnap.size,
    message: `POS별 내역 ${updated}건 보강 완료` +
      (skipped > 0 ? ` / ${skipped}건은 bridge.js migrate 재실행 필요` : ''),
  });
}
