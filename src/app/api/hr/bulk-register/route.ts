import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { isSuperuserEmail } from '@/lib/auth/permissions';
import { recalculateUsedLeave } from '@/lib/hr/leaveBalance';

interface LeaveRecord {
  type: 'leave';
  userId: string;
  userName: string;
  userEmail: string;
  storeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
}

interface DayoffRecord {
  type: 'dayoff';
  userId: string;
  userName: string;
  userEmail: string;
  storeId: string;
  dayoffType: string;
  dates: string[];
  reason: string;
}

type BulkRecord = LeaveRecord | DayoffRecord;

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const userDoc = await adminDb.collection('users').doc(authUser.uid).get();
  const userData = userDoc.data();
  if (!isSuperuserEmail(userData?.email || authUser.email)) {
    return NextResponse.json({ error: '슈퍼유저만 일괄 등록 가능합니다' }, { status: 403 });
  }

  const { records } = await req.json() as { records: BulkRecord[] };
  if (!Array.isArray(records) || records.length === 0) {
    return NextResponse.json({ error: '등록할 데이터가 없습니다' }, { status: 400 });
  }

  const results: { success: boolean; id?: string; error?: string; index: number }[] = [];
  const recalcTargets = new Set<string>();

  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    try {
      if (record.type === 'leave') {
        const ref = await adminDb.collection('hr_leave_requests').add({
          userId:    record.userId,
          userName:  record.userName,
          userEmail: record.userEmail,
          storeId:   record.storeId,
          type:      record.leaveType,
          startDate: record.startDate,
          endDate:   record.endDate,
          reason:    record.reason || '',
          status:    'approved',
          createdAt: FieldValue.serverTimestamp(),
          approvedBy:     authUser.uid,
          approvedByName: userData?.displayName || '슈퍼유저',
          approvedAt:     FieldValue.serverTimestamp(),
        });
        recalcTargets.add(`${record.storeId}::${record.userId}`);
        results.push({ success: true, id: ref.id, index: i });
      } else {
        const ref = await adminDb.collection('hr_dayoff_requests').add({
          userId:    record.userId,
          userName:  record.userName,
          userEmail: record.userEmail,
          storeId:   record.storeId,
          type:      record.dayoffType,
          dates:     record.dates,
          reason:    record.reason || '',
          status:    'approved',
          createdAt: FieldValue.serverTimestamp(),
          approvedBy:     authUser.uid,
          approvedByName: userData?.displayName || '슈퍼유저',
          approvedAt:     FieldValue.serverTimestamp(),
        });
        results.push({ success: true, id: ref.id, index: i });
      }
    } catch (e: any) {
      results.push({ success: false, error: e.message, index: i });
    }
  }

  for (const key of recalcTargets) {
    const [storeId, userId] = key.split('::');
    await recalculateUsedLeave(storeId, userId);
  }

  const failed = results.filter(r => !r.success);
  return NextResponse.json({
    total: records.length,
    created: results.filter(r => r.success).length,
    failed: failed.length,
    errors: failed,
  });
}
