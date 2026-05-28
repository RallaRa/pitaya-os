import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isAdminOrAbove } from '@/lib/auth/permissions';

async function checkAdmin(req: Request, storeId: string) {
  const user = await verifyToken(req);
  if (!user) return null;
  const userDoc = await adminDb.collection('users').doc(user.uid).get();
  const data = userDoc.data();
  const groupId = data?.groupId || 'staff';
  if (!isAdminOrAbove(groupId, data?.email)) return null;
  return user;
}

// GET /api/hr/departments?storeId=X
export async function GET(req: Request) {
  const user = await verifyToken(req);
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const snap = await adminDb.collection('hr_departments')
    .where('storeId', '==', storeId)
    .orderBy('name')
    .get();

  const departments = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return NextResponse.json({ departments });
}

// POST /api/hr/departments  body: { storeId, name }
export async function POST(req: Request) {
  let body: { storeId?: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { storeId, name } = body;
  if (!storeId || !name) return NextResponse.json({ error: 'storeId, name required' }, { status: 400 });

  const admin = await checkAdmin(req, storeId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const existing = await adminDb.collection('hr_departments')
    .where('storeId', '==', storeId).where('name', '==', name.trim()).limit(1).get();
  if (!existing.empty) return NextResponse.json({ error: '이미 존재하는 부서명입니다' }, { status: 409 });

  const ref = adminDb.collection('hr_departments').doc();
  await ref.set({ name: name.trim(), storeId, memberCount: 0, createdAt: new Date().toISOString() });
  return NextResponse.json({ id: ref.id, name: name.trim(), storeId });
}

// PUT /api/hr/departments  body: { id, storeId, name }
export async function PUT(req: Request) {
  let body: { id?: string; storeId?: string; name?: string };
  try { body = await req.json(); } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }); }
  const { id, storeId, name } = body;
  if (!id || !storeId || !name) return NextResponse.json({ error: 'id, storeId, name required' }, { status: 400 });

  const admin = await checkAdmin(req, storeId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  await adminDb.collection('hr_departments').doc(id).update({ name: name.trim(), updatedAt: new Date().toISOString() });
  return NextResponse.json({ ok: true });
}

// DELETE /api/hr/departments?id=X&storeId=X
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id') || '';
  const storeId = searchParams.get('storeId') || '';
  if (!id || !storeId) return NextResponse.json({ error: 'id, storeId required' }, { status: 400 });

  const admin = await checkAdmin(req, storeId);
  if (!admin) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  // Check if any employee is in this department
  const deptDoc = await adminDb.collection('hr_departments').doc(id).get();
  if (!deptDoc.exists) return NextResponse.json({ error: '부서를 찾을 수 없습니다' }, { status: 404 });
  const deptName = deptDoc.data()?.name || '';

  const empSnap = await adminDb.collection('hr_employees')
    .where('storeId', '==', storeId).where('department', '==', deptName).limit(1).get();
  if (!empSnap.empty) return NextResponse.json({ error: '소속 직원이 있어 삭제할 수 없습니다' }, { status: 409 });

  await adminDb.collection('hr_departments').doc(id).delete();
  return NextResponse.json({ ok: true });
}
