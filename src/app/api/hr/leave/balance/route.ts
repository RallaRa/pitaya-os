import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { verifyToken } from '@/lib/authVerify';
import { adjustLeaveBalance, recalculateUsedLeave } from '@/lib/hr/leaveBalance';
import { isHrStoreAdmin } from '@/lib/hr/storeAdmin';

// GET /api/hr/leave/balance?storeId=X&userId=Y  (본인 or 관리자)
// GET /api/hr/leave/balance?storeId=X           (관리자 — 전체 사원)
export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const storeId = searchParams.get('storeId') || '';
  const userId = searchParams.get('userId') || '';

  if (!storeId) return NextResponse.json({ error: 'storeId required' }, { status: 400 });

  const admin = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
  if (!admin && userId && userId !== authUser.uid) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }
  if (!admin && !userId) {
    return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  }

  try {
    if (userId) {
      const targetUid = admin ? userId : authUser.uid;
      const empSnap = await adminDb.collection('hr_employees')
        .where('storeId', '==', storeId)
        .where('linkedUid', '==', targetUid)
        .limit(1)
        .get();
      if (empSnap.empty) {
        return NextResponse.json({ balance: null });
      }
      const emp = empSnap.docs[0].data();
      const total = Number(emp.totalAnnualLeave ?? 0);
      const used = Number(emp.usedAnnualLeave ?? 0);
      return NextResponse.json({
        balance: {
          userId: targetUid,
          name: emp.name,
          empNo: emp.empNo,
          total,
          used,
          remain: total - used,
          overused: used > total,
        },
      });
    }

    const snap = await adminDb.collection('hr_employees')
      .where('storeId', '==', storeId)
      .get();

    const balances = snap.docs
      .map(d => d.data())
      .filter(e => e.status !== '퇴사' && e.linkedUid)
      .map(emp => {
        const total = Number(emp.totalAnnualLeave ?? 0);
        const used = Number(emp.usedAnnualLeave ?? 0);
        return {
          userId: emp.linkedUid,
          name: emp.name,
          empNo: emp.empNo,
          total,
          used,
          remain: total - used,
          overused: used > total,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name, 'ko'));

    return NextResponse.json({ balances });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

// PUT /api/hr/leave/balance — 관리자 수동 조정 또는 승인내역 기준 재계산
export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { storeId, userId, totalAnnualLeave, usedAnnualLeave, recalculate } = body;

    if (!storeId || !userId) {
      return NextResponse.json({ error: 'storeId, userId required' }, { status: 400 });
    }

    const admin = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    if (recalculate) {
      const result = await recalculateUsedLeave(storeId, userId);
      if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
      return NextResponse.json({ balance: result });
    }

    const result = await adjustLeaveBalance(storeId, userId, {
      totalAnnualLeave,
      usedAnnualLeave,
    });
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 });
    return NextResponse.json({ balance: result });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '갱신 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
