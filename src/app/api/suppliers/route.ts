import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';

function suppliersCol(storeId: string) {
  return adminDb.collection('suppliers').doc(storeId).collection('list');
}
function historyCol(storeId: string, supplierId: string) {
  return adminDb.collection('suppliers').doc(storeId)
    .collection('list').doc(supplierId).collection('history');
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const supplierId = searchParams.get('supplierId');
  const type = searchParams.get('type');

  try {
    if (type === 'history' && supplierId) {
      const snap = await historyCol(storeId, supplierId).orderBy('changedAt','desc').limit(20).get();
      return NextResponse.json({ history: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
    }
    const snap = await suppliersCol(storeId).orderBy('supplierName').get();
    return NextResponse.json({ suppliers: snap.docs.map(d => ({ id: d.id, ...d.data() })) });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { storeId, supplier, changedBy } = body;
    if (!storeId || !supplier?.supplierName) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }
    const col = suppliersCol(storeId);
    const ref = col.doc();
    const now = FieldValue.serverTimestamp();
    const data = {
      ...supplier,
      version: 1, currentVersion: 1,
      lastModifiedBy: changedBy || {},
      lastModifiedAt: now, createdAt: now,
    };
    await ref.set(data);
    // 히스토리 저장
    await historyCol(storeId, ref.id).add({
      version: 1, snapshot: supplier,
      changedFields: Object.keys(supplier),
      changeType: 'create', changedBy: changedBy || {},
      changedAt: now, changeSource: 'manual', changeMemo: '거래처 등록',
    });
    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json();
    const { storeId, supplierId, updates, changedBy, changeMemo, changeSource, rollbackVersion } = body;
    if (!storeId || !supplierId) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const docRef = suppliersCol(storeId).doc(supplierId);
    const current = await docRef.get();
    if (!current.exists) return NextResponse.json({ error: '거래처 없음' }, { status: 404 });

    const currentData = current.data()!;
    const now = FieldValue.serverTimestamp();

    if (rollbackVersion !== undefined) {
      // 롤백: 대상 버전 스냅샷 조회
      const histSnap = await historyCol(storeId, supplierId)
        .where('version', '==', rollbackVersion).limit(1).get();
      if (histSnap.empty) return NextResponse.json({ error: '버전 없음' }, { status: 404 });

      const targetSnapshot = histSnap.docs[0].data().snapshot;
      const newVersion = (currentData.currentVersion || 1) + 1;

      // 현재 상태 히스토리 저장
      await historyCol(storeId, supplierId).add({
        version: newVersion, snapshot: currentData,
        changedFields: ['rollback'],
        changeType: 'rollback', changedBy: changedBy || {},
        changedAt: now, changeSource: 'manual',
        changeMemo: `v${rollbackVersion}으로 롤백`,
      });

      await docRef.update({
        ...targetSnapshot,
        version: newVersion, currentVersion: newVersion,
        lastModifiedBy: changedBy || {}, lastModifiedAt: now,
      });
      return NextResponse.json({ ok: true, newVersion });
    }

    // 일반 업데이트
    const newVersion = (currentData.currentVersion || 1) + 1;
    const changedFields = Object.keys(updates);

    await historyCol(storeId, supplierId).add({
      version: newVersion, snapshot: { ...currentData, ...updates },
      changedFields, changeType: 'update',
      changedBy: changedBy || {}, changedAt: now,
      changeSource: changeSource || 'manual', changeMemo: changeMemo || '',
    });

    await docRef.update({
      ...updates, version: newVersion, currentVersion: newVersion,
      lastModifiedBy: changedBy || {}, lastModifiedAt: now,
    });
    return NextResponse.json({ ok: true, newVersion });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const supplierId = searchParams.get('supplierId') || '';
  try {
    await suppliersCol(storeId).doc(supplierId).delete();
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
