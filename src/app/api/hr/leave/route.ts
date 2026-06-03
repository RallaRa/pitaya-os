import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken } from '@/lib/authVerify';
import { recalculateUsedLeave } from '@/lib/hr/leaveBalance';
import { isHrStoreAdmin, leaveRequestOverlapsMonth } from '@/lib/hr/storeAdmin';
import { notifyUser } from '@/lib/notifications/notifyUser';

const LEAVE_TYPE_LABEL: Record<string, string> = {
  annual: '연차',
  half_am: '반차(오전)',
  half_pm: '반차(오후)',
  monthly: '월차',
};

const SUPERUSER_EMAIL = process.env.SUPERUSER_EMAIL || process.env.NEXT_PUBLIC_SUPERUSER_EMAIL || '';

async function sendNotification(targetUid: string, title: string, body: string, link: string, type = 'leave_request') {
  await notifyUser(targetUid, { title, message: body, link, type });
}

async function getSuperuserUid(): Promise<string | null> {
  if (!SUPERUSER_EMAIL) return null;
  try {
    const snap = await adminDb.collection('users')
      .where('email', '==', SUPERUSER_EMAIL)
      .limit(1).get();
    return snap.empty ? null : snap.docs[0].id;
  } catch { return null; }
}

async function getApproverUids(storeId: string): Promise<string[]> {
  const uids = new Set<string>();
  const suUid = await getSuperuserUid();
  if (suUid) uids.add(suUid);
  if (storeId) {
    const snap = await adminDb.collection('user_store_map')
      .where('storeId', '==', storeId)
      .where('status', '==', 'active')
      .get();
    snap.docs.forEach(d => {
      const { uid, role, groupId } = d.data();
      if (['owner', 'admin'].includes(role) || ['master', 'admin'].includes(groupId)) {
        uids.add(uid);
      }
    });
  }
  return [...uids];
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get('userId');
  const storeId = searchParams.get('storeId');
  const status  = searchParams.get('status');
  const month   = searchParams.get('month');

  if (storeId) {
    const admin = await isHrStoreAdmin(authUser.uid, storeId, authUser.email);
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  } else if (userId) {
    if (userId !== authUser.uid) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
  } else {
    return NextResponse.json({ error: 'userId 또는 storeId 필요' }, { status: 400 });
  }

  try {
    let q: FirebaseFirestore.Query = adminDb.collection('hr_leave_requests');
    if (userId)  q = q.where('userId', '==', userId);
    if (storeId) q = q.where('storeId', '==', storeId);
    if (status)  q = q.where('status', '==', status);

    const snap = await q.limit(500).get();
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as Record<string, unknown>[];
    docs.sort((a, b) => ((b.createdAt as { seconds?: number })?.seconds ?? 0) - ((a.createdAt as { seconds?: number })?.seconds ?? 0));
    docs = docs.slice(0, 200);

    if (month) {
      docs = docs.filter(d => leaveRequestOverlapsMonth(d.startDate, d.endDate, month));
    }

    return NextResponse.json({ requests: docs });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '조회 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      userId, userName, userEmail, storeId, type, startDate, endDate, reason,
      status: directStatus,
    } = body;

    if (!userId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }

    const admin = storeId ? await isHrStoreAdmin(authUser.uid, storeId, authUser.email) : false;
    if (userId !== authUser.uid && !admin) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const isDirectApprove = admin && directStatus === 'approved';
    const userDoc = await adminDb.collection('users').doc(authUser.uid).get();
    const approverName = userDoc.data()?.name || userDoc.data()?.displayName || '관리자';

    const ref = await adminDb.collection('hr_leave_requests').add({
      userId, userName, userEmail, storeId,
      type,
      startDate, endDate,
      reason: reason || '',
      status: isDirectApprove ? 'approved' : 'pending',
      createdAt: FieldValue.serverTimestamp(),
      approvedBy:     isDirectApprove ? authUser.uid : null,
      approvedByName: isDirectApprove ? approverName : null,
      approvedAt:     isDirectApprove ? FieldValue.serverTimestamp() : null,
      updatedAt:      FieldValue.serverTimestamp(),
    });

    if (isDirectApprove) {
      const balance = await recalculateUsedLeave(storeId, userId);
      const typeLabel = LEAVE_TYPE_LABEL[type as string] || type;
      await notifyUser(userId, {
        title: '연차 등록',
        message: `${startDate}~${endDate} ${typeLabel}가 등록되었습니다.`,
        link: '/dashboard/hr/calendar?tab=leave',
        type: 'leave_approved',
      });
      return NextResponse.json({ id: ref.id, balance });
    }

    const approvers = await getApproverUids(storeId);
    const typeLabel = LEAVE_TYPE_LABEL[type as string] || type;
    await Promise.all(approvers.map(approverUid =>
      sendNotification(approverUid,
        '연차 신청',
        `${userName}님이 ${typeLabel} 신청했습니다 (${startDate}~${endDate})`,
        '/dashboard/hr/calendar?tab=leave',
      ),
    ));

    await notifyUser(userId, {
      title: '연차 신청 접수',
      message: `${startDate}~${endDate} ${typeLabel} 신청이 접수되었습니다.`,
      link: '/dashboard/hr/calendar?tab=leave',
      type: 'leave_request',
    });

    return NextResponse.json({ id: ref.id });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '등록 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const {
      id,
      status,
      approvedBy,
      approvedByName,
      type,
      startDate,
      endDate,
      reason,
      userName,
    } = body;

    if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

    const ref  = adminDb.collection('hr_leave_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: '신청 없음' }, { status: 404 });

    const data = snap.data()!;
    const admin = await isHrStoreAdmin(authUser.uid, data.storeId, authUser.email);
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    const userDoc = await adminDb.collection('users').doc(authUser.uid).get();
    const editorName = userDoc.data()?.name || userDoc.data()?.displayName || '관리자';

    const isEdit = type !== undefined || startDate !== undefined ||
      endDate !== undefined || reason !== undefined || userName !== undefined;

    const updates: Record<string, unknown> = {
      updatedAt: FieldValue.serverTimestamp(),
      updatedBy: authUser.uid,
      updatedByName: editorName,
    };

    if (isEdit) {
      if (type !== undefined) updates.type = type;
      if (startDate !== undefined) updates.startDate = startDate;
      if (endDate !== undefined) updates.endDate = endDate;
      if (reason !== undefined) updates.reason = reason;
      if (userName !== undefined) updates.userName = userName;
    }

    if (status !== undefined) {
      updates.status = status;
      if (status === 'approved' || status === 'rejected') {
        updates.approvedBy = approvedBy || authUser.uid;
        updates.approvedByName = approvedByName || editorName;
        updates.approvedAt = FieldValue.serverTimestamp();
      }
    }

    await ref.update(updates);

    const balance = await recalculateUsedLeave(data.storeId, data.userId);

    if (status && status !== data.status) {
      const label = status === 'approved' ? '승인' : '거절';
      const typeLabel = LEAVE_TYPE_LABEL[data.type as string] || data.type;
      const notifType = status === 'approved' ? 'leave_approved' : 'leave_rejected';
      const dates = `${updates.startDate ?? data.startDate}~${updates.endDate ?? data.endDate}`;
      await sendNotification(
        data.userId,
        `연차 ${label}`,
        `${dates} ${typeLabel} 신청이 ${label}되었습니다.`,
        '/dashboard/hr/calendar?tab=leave',
        notifType,
      );
    }

    return NextResponse.json({
      success: true,
      balance,
      overused: balance.overused,
      warning: balance.overused ? '연차 선사용 상태입니다(잔여 마이너스). 급여·연차 정산 시 참고하세요.' : undefined,
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '처리 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const id = searchParams.get('id');

  if (!id) return NextResponse.json({ error: 'id required' }, { status: 400 });

  try {
    const ref  = adminDb.collection('hr_leave_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: '신청 없음' }, { status: 404 });

    const data = snap.data()!;
    const admin = await isHrStoreAdmin(authUser.uid, data.storeId, authUser.email);

    if (data.userId !== authUser.uid && !admin) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }
    if (!admin && data.status !== 'pending') {
      return NextResponse.json({ error: '대기 중인 신청만 취소 가능' }, { status: 400 });
    }

    await ref.delete();
    const balance = admin || data.status === 'approved'
      ? await recalculateUsedLeave(data.storeId, data.userId)
      : null;

    return NextResponse.json({ success: true, balance });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : '삭제 실패';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
