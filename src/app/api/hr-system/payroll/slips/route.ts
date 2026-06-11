import { NextResponse } from 'next/server';
import { verifyToken } from '@/lib/authVerify';
import { listPayrollSlips } from '@/lib/hr-system/payrollService';
import { adminDb } from '@/lib/firebase/admin';

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const period = searchParams.get('period') || '';
  const empNo = searchParams.get('empNo') || '';

  if (!storeId || !period) {
    return NextResponse.json({ error: 'storeId, period required' }, { status: 400 });
  }

  if (empNo) {
    const docId = `${storeId}_${period}_${empNo}`;
    const snap = await adminDb.collection('hr_payroll_slips').doc(docId).get();
    if (!snap.exists) return NextResponse.json({ error: '명세서 없음' }, { status: 404 });

    const slip = { id: snap.id, ...snap.data() };
    const empSnap = await adminDb.collection('hr_employees').doc(`${storeId}_${empNo}`).get();
    const linkedUid = empSnap.data()?.linkedUid || '';
    const isOwner = linkedUid === authUser.uid;

    const userDoc = await adminDb.collection('users').doc(authUser.uid).get();
    const groupId = userDoc.data()?.groupId || 'staff';
    const isAdmin = ['superuser', 'admin', 'master', 'owner'].includes(groupId);

    if (!isOwner && !isAdmin) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    return NextResponse.json({ slip });
  }

  const slips = await listPayrollSlips(storeId, period);
  return NextResponse.json({ slips });
}
