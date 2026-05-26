import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId, isAdminGroup } from '@/lib/authVerify';

// ── POST /api/admin/migrate-pos-to-reports ────────────────────────
// pos_finish_total + pos_sales_detail 데이터를 daily_reports 구조로 마이그레이션
// 권한: master / admin 이상
export async function POST(req: Request) {
  const user = await verifyToken(req);
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { storeId } = await req.json().catch(() => ({}));
  if (!storeId) {
    return NextResponse.json({ error: 'storeId is required' }, { status: 400 });
  }

  const groupId = await getActualGroupId(user.uid, storeId);
  if (!isAdminGroup(groupId)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  // pos_finish_total 전체 조회 (해당 storeId)
  const finishSnap = await adminDb
    .collection('pos_finish_total')
    .where('storeId', '==', storeId)
    .get();

  if (finishSnap.empty) {
    return NextResponse.json({ success: true, migrated: 0, skipped: 0, message: 'POS 데이터 없음' });
  }

  let migrated = 0;
  let skipped  = 0;

  for (const finishDoc of finishSnap.docs) {
    const f    = finishDoc.data();
    const date = f.date as string;
    if (!date) { skipped++; continue; }

    const posDocId = `pos_${storeId}_${date}`;

    // 이미 pos_bridge 문서가 있으면 스킵
    const existingPos = await adminDb.collection('daily_reports').doc(posDocId).get();
    if (existingPos.exists) { skipped++; continue; }

    // 수동입력 문서가 있는 날짜는 스킵
    const manualSnap = await adminDb
      .collection('daily_reports')
      .where('storeId', '==', storeId)
      .where('reportDate', '==', date)
      .limit(1)
      .get();
    if (!manualSnap.empty) { skipped++; continue; }

    // pos_sales_detail 조회
    const detailSnap = await adminDb
      .collection('pos_sales_detail')
      .where('storeId', '==', storeId)
      .where('date', '==', date)
      .get();

    const items = detailSnap.docs.map(d => {
      const r = d.data();
      return {
        barcode:       r.barcode       ?? '',
        name:          r.goodsName     ?? '',
        qty:           r.saleCount     ?? 0,
        amount:        r.totalPrice    ?? 0,
        sellPrice:     r.sellPrice     ?? 0,
        purPrice:      r.purPrice      ?? 0,
        profitPrice:   r.profitPrice   ?? 0,
        netSales:      r.totalPrice    ?? 0,
        categoryCode:  r.categoryCode  ?? '',
        categoryName:  r.categoryName  ?? '',
        returnAmount:  0,
        discountAmount: 0,
      };
    });

    // pos_sales_header 조회 (transCount)
    const headerSnap = await adminDb
      .collection('pos_sales_header')
      .doc(`${storeId}_${date}`)
      .get();
    const transCount = headerSnap.exists ? (headerSnap.data()?.transCount ?? 0) : 0;

    const totalSales  = f.totalSale   ?? 0;
    const netSales    = f.netSale     ?? totalSales;
    const syncedAt    = (f.syncedAt as string) || new Date().toISOString();

    await adminDb.collection('daily_reports').doc(posDocId).set({
      storeId,
      reportDate:    date,
      serialNumber:  posDocId,
      receiptNumber: '',
      totalSales,
      netSales,
      cashSale:       f.cashSale    ?? 0,
      cardSale:       f.cardSale    ?? 0,
      returnAmount:   f.returnSale  ?? 0,
      returnCount:    f.returnCount ?? 0,
      discountAmount: 0,
      customerCount:  transCount,
      cusPoint:       f.cusPoint    ?? 0,
      items,
      weather:    null,
      issues:     [],
      promotions: [],
      source:     'pos_bridge_migration',
      syncedAt,
      createdAt:      FieldValue.serverTimestamp(),
      lastModifiedAt: FieldValue.serverTimestamp(),
      editHistory: [],
    });

    migrated++;
  }

  return NextResponse.json({
    success: true,
    migrated,
    skipped,
    message: `${migrated}건 마이그레이션 완료, ${skipped}건 스킵`,
  });
}
