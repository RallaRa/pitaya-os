import { NextResponse } from 'next/server';
import { FieldValue } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { isHrStoreAdmin } from '@/lib/hr/storeAdmin';

const TYPE_LABEL: Record<string, string> = {
  hire: '입사',
  promotion: '승진',
  transfer: '전보',
  position: '직책변경',
  resign: '퇴사',
};

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const storeId = new URL(req.url).searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const snap = await adminDb.collection('hr_appointments')
    .where('storeId', '==', storeId)
    .orderBy('effectiveDate', 'desc')
    .limit(100)
    .get();

  const appointments = snap.docs.map(d => ({
    id: d.id,
    ...d.data(),
    typeLabel: TYPE_LABEL[String(d.data().type)] || d.data().type,
  }));

  return NextResponse.json({ appointments });
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  const storeId = String(body.storeId || '');
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const allowed = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const empNo = String(body.empNo || '');
  const type = String(body.type || 'position');
  const effectiveDate = String(body.effectiveDate || '');
  if (!empNo || !effectiveDate) {
    return NextResponse.json({ error: 'empNo, effectiveDate 필수' }, { status: 400 });
  }

  const empSnap = await adminDb.collection('hr_employees').doc(`${storeId}_${empNo}`).get();
  if (!empSnap.exists) return NextResponse.json({ error: '사원 없음' }, { status: 404 });
  const emp = empSnap.data()!;

  const id = `${storeId}_${Date.now()}`;
  const doc = {
    storeId,
    empNo,
    empName: String(body.empName || emp.name || ''),
    type,
    effectiveDate,
    fromDepartment: body.fromDepartment ?? emp.department ?? '',
    toDepartment: body.toDepartment ?? '',
    fromPosition: body.fromPosition ?? emp.position ?? '',
    toPosition: body.toPosition ?? '',
    memo: String(body.memo || ''),
    createdAt: new Date().toISOString(),
    createdBy: authUser.uid,
    savedAt: FieldValue.serverTimestamp(),
  };

  await adminDb.collection('hr_appointments').doc(id).set(doc);

  if (body.applyToEmployee) {
    const patch: Record<string, unknown> = { updatedAt: new Date().toISOString() };
    if (doc.toDepartment) patch.department = doc.toDepartment;
    if (doc.toPosition) patch.position = doc.toPosition;
    if (type === 'resign') {
      patch.status = '퇴직';
      patch.resignDate = effectiveDate;
    }
    await adminDb.collection('hr_employees').doc(`${storeId}_${empNo}`).update(patch);
  }

  return NextResponse.json({ appointment: { id, ...doc } });
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const id = searchParams.get('id') || '';
  if (!storeId || !id) return NextResponse.json({ error: 'storeId, id required' }, { status: 400 });

  const allowed = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!allowed) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await adminDb.collection('hr_appointments').doc(id).delete();
  return NextResponse.json({ ok: true });
}
