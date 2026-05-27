import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase/admin';
import { FieldValue } from 'firebase-admin/firestore';
import { verifyToken, getActualGroupId } from '@/lib/authVerify';

const ADMIN_ROLES = ['master', 'admin', 'owner'];

async function isStoreAdmin(uid: string, storeId: string) {
  const role = await getActualGroupId(uid, storeId);
  return ADMIN_ROLES.includes(role);
}

async function sendNotification(targetUid: string, title: string, body: string, link: string) {
  await adminDb.collection('notifications').add({
    targetUid, title, body, link,
    type: 'hr_leave',
    isRead: false,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function getAdminUids(storeId: string): Promise<string[]> {
  if (!storeId) return [];
  const snap = await adminDb.collection('store_members')
    .where('storeId', '==', storeId)
    .where('role', 'in', ['owner', 'admin'])
    .where('status', '==', 'approved')
    .get();
  return snap.docs.map(d => d.data().uid).filter(Boolean);
}

export async function GET(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const userId  = searchParams.get('userId');
  const storeId = searchParams.get('storeId');
  const status  = searchParams.get('status');
  const month   = searchParams.get('month');

  // 본인 데이터 or 관리자(storeId 기준)만 조회 가능
  if (storeId) {
    const admin = await isStoreAdmin(authUser.uid, storeId);
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
    let docs = snap.docs.map(d => ({ id: d.id, ...d.data() })) as any[];
    docs.sort((a: any, b: any) => (b.createdAt?.seconds ?? 0) - (a.createdAt?.seconds ?? 0));
    docs = docs.slice(0, 200);

    if (month) {
      docs = docs.filter((d: any) => d.startDate?.startsWith(month) || d.endDate?.startsWith(month));
    }

    return NextResponse.json({ requests: docs });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { userId, userName, userEmail, storeId, type, startDate, endDate, reason } = body;

    if (!userId || !type || !startDate || !endDate) {
      return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });
    }
    // 본인 명의로만 신청 가능
    if (userId !== authUser.uid) {
      return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    }

    const ref = await adminDb.collection('hr_leave_requests').add({
      userId, userName, userEmail, storeId,
      type,
      startDate, endDate,
      reason:    reason || '',
      status:    'pending',
      createdAt: FieldValue.serverTimestamp(),
      approvedBy:  null,
      approvedAt:  null,
    });

    const admins = await getAdminUids(storeId);
    const typeLabel = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)' }[type as string] || type;
    await Promise.all(admins.map(uid =>
      sendNotification(uid,
        '연차 신청',
        `${userName}님이 ${typeLabel} 신청했습니다 (${startDate}~${endDate})`,
        '/dashboard/hr/calendar',
      )
    ));

    return NextResponse.json({ id: ref.id });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: Request) {
  const authUser = await verifyToken(req);
  if (!authUser) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  try {
    const body = await req.json();
    const { id, status, approvedBy, approvedByName } = body;

    if (!id || !status) return NextResponse.json({ error: '필수 항목 누락' }, { status: 400 });

    const ref  = adminDb.collection('hr_leave_requests').doc(id);
    const snap = await ref.get();
    if (!snap.exists) return NextResponse.json({ error: '신청 없음' }, { status: 404 });

    // 해당 매장의 관리자만 승인/거절 가능
    const data = snap.data()!;
    const admin = await isStoreAdmin(authUser.uid, data.storeId);
    if (!admin) return NextResponse.json({ error: '권한 없음' }, { status: 403 });

    await ref.update({
      status,
      approvedBy:     approvedBy || null,
      approvedByName: approvedByName || null,
      approvedAt:     FieldValue.serverTimestamp(),
    });

    const label = status === 'approved' ? '승인' : '거절';
    const typeLabel = { annual: '연차', half_am: '반차(오전)', half_pm: '반차(오후)' }[data.type as string] || data.type;
    await sendNotification(
      data.userId,
      `연차 ${label}`,
      `${data.startDate}~${data.endDate} ${typeLabel} 신청이 ${label}되었습니다.`,
      '/dashboard/hr/calendar',
    );

    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
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
    // 파라미터 userId 대신 토큰으로 본인 확인
    if (data.userId !== authUser.uid) return NextResponse.json({ error: '권한 없음' }, { status: 403 });
    if (data.status !== 'pending') return NextResponse.json({ error: '대기 중인 신청만 취소 가능' }, { status: 400 });

    await ref.delete();
    return NextResponse.json({ success: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
