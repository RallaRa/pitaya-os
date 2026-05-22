import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function calcStatus(passed: number, total: number): 'pass' | 'partial' | 'fail' {
  if (total === 0) return 'fail';
  if (passed === total) return 'pass';
  if (passed / total >= 0.8) return 'partial';
  return 'fail';
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId   = searchParams.get('storeId');
  const date      = searchParams.get('date');
  const startDate = searchParams.get('startDate');
  const endDate   = searchParams.get('endDate');

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  try {
    // 특정 날짜 단건 조회
    if (date) {
      const snap = await adminDb.collection('hygiene_checklists')
        .where('storeId', '==', storeId)
        .where('checkDate', '==', date)
        .limit(1)
        .get();
      if (snap.empty) return NextResponse.json({ record: null });
      const doc = snap.docs[0];
      return NextResponse.json({ record: { id: doc.id, ...doc.data() } });
    }

    // 기간 목록 조회 — storeId 단일 equality 필터 후 JS에서 날짜 필터 (composite index 불필요)
    const snap = await adminDb.collection('hygiene_checklists')
      .where('storeId', '==', storeId)
      .get();

    let records = snap.docs.map(doc => ({ id: doc.id, ...doc.data() })) as any[];
    if (startDate) records = records.filter((r: any) => r.checkDate >= startDate);
    if (endDate)   records = records.filter((r: any) => r.checkDate <= endDate);
    records.sort((a: any, b: any) => b.checkDate.localeCompare(a.checkDate));

    return NextResponse.json({ records });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const { storeId, uid, inspectorName, checkDate, items, totalItems, passedItems } = await req.json();

    if (!storeId || !uid || !checkDate) {
      return NextResponse.json({ error: '필수 항목 누락 (storeId, uid, checkDate)' }, { status: 400 });
    }

    const status = calcStatus(passedItems ?? 0, totalItems ?? 0);

    // 같은 날짜 + 매장이면 업데이트
    const existing = await adminDb.collection('hygiene_checklists')
      .where('storeId', '==', storeId)
      .where('checkDate', '==', checkDate)
      .limit(1)
      .get();

    if (!existing.empty) {
      await existing.docs[0].ref.update({
        uid, inspectorName: inspectorName || '',
        items: items || {}, totalItems: totalItems ?? 0,
        passedItems: passedItems ?? 0, status,
        updatedAt: FieldValue.serverTimestamp(),
      });
      return NextResponse.json({ success: true, id: existing.docs[0].id });
    }

    const ref = await adminDb.collection('hygiene_checklists').add({
      storeId, uid, inspectorName: inspectorName || '',
      checkDate, items: items || {},
      totalItems: totalItems ?? 0, passedItems: passedItems ?? 0, status,
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });

    return NextResponse.json({ success: true, id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
